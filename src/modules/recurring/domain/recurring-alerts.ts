import { CADENCE_RULES } from './cadence';
import { isSteady } from './amount-profile';
import { merchantKeyOf } from './merchant-key';
import {
    ALERT_KINDS,
    ALERT_RECENCY_DAYS,
    AlertCharge,
    AlertSeries,
    DesiredAlert,
    PRICE_RISE_ABSOLUTE_MINOR,
    PRICE_RISE_RELATIVE,
    PRICE_WINDOW,
    RETURN_GAP_DAYS
} from './recurring-alerts.types';
import { daysBetween, distanceToDay, signedDaysBetween } from './recurring-dates';
import { isWithinRatio, median } from './recurring-math';
import { SERIES_STATUSES, STOPPED_BY } from './recurring-series.types';
import { BAND_TOLERANCE, CADENCES, CROSS_ACCOUNT_VALUE_TOLERANCE, DAY_TOLERANCE, DetectorTransaction } from './recurring.types';
import { selectEligible } from './eligible-transactions';

interface Scope {
    readonly today: string;
    readonly byId: ReadonlyMap<string, AlertCharge>;
    readonly byMerchant: ReadonlyMap<string, readonly AlertCharge[]>;
    readonly linked: ReadonlySet<string>;
}

const ANNUAL_WINDOW: number = 1;
const MIN_PRIOR: number = 2;
const MERGE_INTERVAL_FACTOR: number = 2;

export function chargesOfTransactions(transactions: readonly DetectorTransaction[]): AlertCharge[] {
    const charges: AlertCharge[] = [];
    for (const transaction of selectEligible(transactions)) {
        const merchantKey: string | null = merchantKeyOf(transaction);
        if (merchantKey !== null) {
            charges.push({
                id: transaction.id,
                date: transaction.date,
                amountMinor: -transaction.amountMinor,
                accountId: transaction.accountId,
                merchantKey
            });
        }
    }
    return charges.sort(byDate);
}

function byDate(left: AlertCharge, right: AlertCharge): number {
    return left.date.localeCompare(right.date) || left.id.localeCompare(right.id);
}

function isActive(series: AlertSeries): boolean {
    return series.status === SERIES_STATUSES.suggested || series.status === SERIES_STATUSES.confirmed;
}

function isRecent(date: string, today: string): boolean {
    return signedDaysBetween(date, today) <= ALERT_RECENCY_DAYS;
}

function riseThreshold(base: number): number {
    return Math.max(PRICE_RISE_ABSOLUTE_MINOR, Math.round(base * PRICE_RISE_RELATIVE));
}

function resolve(ids: readonly string[], scope: Scope): AlertCharge[] {
    const found: AlertCharge[] = [];
    for (const id of ids) {
        const charge: AlertCharge | undefined = scope.byId.get(id);
        if (charge !== undefined) {
            found.push(charge);
        }
    }
    return found.sort(byDate);
}

function priceAlert(series: AlertSeries, charge: AlertCharge, from: number): DesiredAlert {
    return {
        seriesId: series.id,
        kind: ALERT_KINDS.priceIncrease,
        fingerprint: charge.id,
        occurredOn: charge.date,
        data: {
            fromAmountMinor: from,
            toAmountMinor: charge.amountMinor,
            percent: Math.round(((charge.amountMinor - from) / from) * 100),
            chargeDate: charge.date
        }
    };
}

function plateauStart(amounts: readonly number[]): number {
    for (let start: number = 0; start < amounts.length; start += 1) {
        if (isSteady(amounts.slice(start))) {
            return start;
        }
    }
    return amounts.length - 1;
}

function priceIncreaseInside(series: AlertSeries, scope: Scope): DesiredAlert[] {
    const own: AlertCharge[] = resolve(series.chargeIds, scope);
    const annual: boolean = series.cadence === CADENCES.annual;
    const start: number = plateauStart(own.map((charge: AlertCharge): number => charge.amountMinor));
    const first: AlertCharge | undefined = own[start];
    const prior: AlertCharge[] = own.slice(0, start).slice(-(annual ? ANNUAL_WINDOW : PRICE_WINDOW));
    if (first === undefined || prior.length < (annual ? ANNUAL_WINDOW : MIN_PRIOR) || !isRecent(first.date, scope.today)) {
        return [];
    }
    const amounts: number[] = prior.map((charge: AlertCharge): number => charge.amountMinor);
    const base: number = median(amounts);
    const raised: boolean = first.amountMinor >= base + riseThreshold(base);
    return raised && isSteady(amounts) ? [priceAlert(series, first, base)] : [];
}

function isOnSchedule(series: AlertSeries, previous: AlertCharge, next: AlertCharge): boolean {
    const rule: (typeof CADENCE_RULES)[number] | undefined = CADENCE_RULES.find(
        (candidate: (typeof CADENCE_RULES)[number]): boolean => candidate.cadence === series.cadence
    );
    const interval: number = daysBetween(previous.date, next.date);
    const inRange: boolean = rule !== undefined && interval >= rule.minDays && interval <= rule.maxDays * MERGE_INTERVAL_FACTOR;
    return inRange && (series.expectedDay === null || distanceToDay(next.date, series.expectedDay) <= DAY_TOLERANCE);
}

function loosePerMerchant(series: AlertSeries, after: string, scope: Scope): AlertCharge[] {
    return (scope.byMerchant.get(series.merchantKey) ?? []).filter(
        (charge: AlertCharge): boolean => charge.date > after && !scope.linked.has(charge.id)
    );
}

function priceIncreaseBeyondBand(series: AlertSeries, scope: Scope): DesiredAlert[] {
    const own: AlertCharge[] = resolve(series.chargeIds, scope);
    const last: AlertCharge | undefined = own.at(-1);
    if (
        last === undefined ||
        own.length < MIN_PRIOR ||
        !isSteady(own.slice(-PRICE_WINDOW).map((charge: AlertCharge): number => charge.amountMinor))
    ) {
        return [];
    }
    const followers: AlertCharge[] = loosePerMerchant(series, last.date, scope);
    const next: AlertCharge | undefined = followers[0];
    const valid: boolean =
        followers.length === 1 &&
        next !== undefined &&
        isRecent(next.date, scope.today) &&
        isOnSchedule(series, last, next) &&
        next.amountMinor >= last.amountMinor + riseThreshold(last.amountMinor);
    return valid && next !== undefined ? [priceAlert(series, next, last.amountMinor)] : [];
}

function originalOf(own: readonly AlertCharge[], duplicate: AlertCharge): AlertCharge | null {
    let original: AlertCharge | null = null;
    for (const charge of own) {
        if (charge.date <= duplicate.date && charge.id !== duplicate.id) {
            original = charge;
        }
    }
    return original;
}

function duplicateCharges(series: AlertSeries, scope: Scope): DesiredAlert[] {
    const own: AlertCharge[] = resolve(series.chargeIds, scope);
    const alerts: DesiredAlert[] = [];
    for (const duplicate of resolve(series.duplicateIds, scope)) {
        const original: AlertCharge | null = originalOf(own, duplicate);
        if (original !== null && isRecent(duplicate.date, scope.today)) {
            alerts.push({
                seriesId: series.id,
                kind: ALERT_KINDS.duplicateCharge,
                fingerprint: duplicate.id,
                occurredOn: duplicate.date,
                data: {
                    firstDate: original.date,
                    firstAmountMinor: original.amountMinor,
                    secondDate: duplicate.date,
                    secondAmountMinor: duplicate.amountMinor
                }
            });
        }
    }
    return alerts;
}

function trialConverted(series: AlertSeries, scope: Scope): DesiredAlert[] {
    const first: AlertCharge | undefined = resolve(series.chargeIds, scope)[0];
    const trial: AlertCharge | undefined = resolve(series.trialIds, scope).at(-1);
    if (first === undefined || trial === undefined || !isRecent(first.date, scope.today)) {
        return [];
    }
    return [
        {
            seriesId: series.id,
            kind: ALERT_KINDS.trialConverted,
            fingerprint: first.id,
            occurredOn: first.date,
            data: { trialAmountMinor: trial.amountMinor, firstAmountMinor: first.amountMinor, chargeDate: first.date }
        }
    ];
}

function returnedCandidates(series: AlertSeries, scope: Scope): AlertCharge[] {
    const own: ReadonlySet<string> = new Set<string>([...series.chargeIds, ...series.duplicateIds]);
    return (scope.byMerchant.get(series.merchantKey) ?? []).filter(
        (charge: AlertCharge): boolean =>
            (own.has(charge.id) || !scope.linked.has(charge.id)) &&
            isWithinRatio(charge.amountMinor, series.typicalAmountMinor, BAND_TOLERANCE)
    );
}

function isUserStop(series: AlertSeries): boolean {
    return series.status === SERIES_STATUSES.stopped && series.stoppedBy === STOPPED_BY.user && series.stoppedOn !== null;
}

function returnAlert(series: AlertSeries, before: AlertCharge, back: AlertCharge): DesiredAlert {
    return {
        seriesId: series.id,
        kind: ALERT_KINDS.returned,
        fingerprint: back.id,
        occurredOn: back.date,
        data: { lastDate: before.date, returnDate: back.date, amountMinor: back.amountMinor, gapDays: daysBetween(before.date, back.date) }
    };
}

function returned(series: AlertSeries, scope: Scope): DesiredAlert[] {
    const stoppedOn: string | null = series.stoppedOn;
    if (!isUserStop(series) || stoppedOn === null) {
        return [];
    }
    const candidates: AlertCharge[] = returnedCandidates(series, scope);
    const before: AlertCharge | undefined = candidates.findLast((charge: AlertCharge): boolean => charge.date <= stoppedOn);
    const back: AlertCharge | undefined = candidates.find((charge: AlertCharge): boolean => charge.date > stoppedOn);
    const valid: boolean =
        before !== undefined &&
        back !== undefined &&
        isRecent(back.date, scope.today) &&
        daysBetween(before.date, back.date) >= RETURN_GAP_DAYS;
    return valid && before !== undefined && back !== undefined ? [returnAlert(series, before, back)] : [];
}

function groupByMerchant(active: readonly AlertSeries[]): Map<string, AlertSeries[]> {
    const grouped: Map<string, AlertSeries[]> = new Map<string, AlertSeries[]>();
    for (const series of active) {
        grouped.set(series.merchantKey, [...(grouped.get(series.merchantKey) ?? []), series]);
    }
    return grouped;
}

function isSameSubscription(left: AlertSeries, right: AlertSeries): boolean {
    return (
        left.accountId !== right.accountId &&
        isWithinRatio(left.typicalAmountMinor, right.typicalAmountMinor, CROSS_ACCOUNT_VALUE_TOLERANCE)
    );
}

function accountAlert(left: AlertSeries, right: AlertSeries): DesiredAlert {
    return {
        seriesId: left.id,
        kind: ALERT_KINDS.duplicateAccount,
        fingerprint: right.id,
        occurredOn: '',
        data: {
            otherSeriesId: right.id,
            accountId: left.accountId,
            otherAccountId: right.accountId,
            amountMinor: left.typicalAmountMinor,
            otherAmountMinor: right.typicalAmountMinor
        }
    };
}

function pairsOf(group: readonly AlertSeries[]): [AlertSeries, AlertSeries][] {
    const sorted: AlertSeries[] = group.toSorted((left: AlertSeries, right: AlertSeries): number => left.id.localeCompare(right.id));
    return sorted.flatMap((left: AlertSeries, index: number): [AlertSeries, AlertSeries][] =>
        sorted.slice(index + 1).map((right: AlertSeries): [AlertSeries, AlertSeries] => [left, right])
    );
}

function duplicateAccounts(active: readonly AlertSeries[]): DesiredAlert[] {
    return [...groupByMerchant(active).values()]
        .flatMap(pairsOf)
        .filter(([left, right]: [AlertSeries, AlertSeries]): boolean => isSameSubscription(left, right))
        .map(([left, right]: [AlertSeries, AlertSeries]): DesiredAlert => accountAlert(left, right));
}

function scopeOf(series: readonly AlertSeries[], charges: readonly AlertCharge[], today: string): Scope {
    const byMerchant: Map<string, AlertCharge[]> = new Map<string, AlertCharge[]>();
    for (const charge of charges) {
        byMerchant.set(charge.merchantKey, [...(byMerchant.get(charge.merchantKey) ?? []), charge]);
    }
    return {
        today,
        byId: new Map<string, AlertCharge>(charges.map((charge: AlertCharge): [string, AlertCharge] => [charge.id, charge])),
        byMerchant,
        linked: new Set<string>(
            series.flatMap((item: AlertSeries): string[] => [...item.chargeIds, ...item.duplicateIds, ...item.trialIds])
        )
    };
}

function latestChargeDate(series: AlertSeries, scope: Scope): string {
    return resolve(series.chargeIds, scope).at(-1)?.date ?? scope.today;
}

export function deriveAlerts(series: readonly AlertSeries[], charges: readonly AlertCharge[], today: string): DesiredAlert[] {
    const scope: Scope = scopeOf(series, charges, today);
    const active: AlertSeries[] = series.filter(isActive);
    const perSeries: DesiredAlert[] = [];
    for (const item of active) {
        perSeries.push(
            ...priceIncreaseInside(item, scope),
            ...priceIncreaseBeyondBand(item, scope),
            ...duplicateCharges(item, scope),
            ...trialConverted(item, scope)
        );
    }
    for (const item of series) {
        perSeries.push(...returned(item, scope));
    }
    const accounts: DesiredAlert[] = duplicateAccounts(active).map((alert: DesiredAlert): DesiredAlert => ({
        ...alert,
        occurredOn: latestOf(alert, series, scope)
    }));
    return [...perSeries, ...accounts];
}

function latestOf(alert: DesiredAlert, series: readonly AlertSeries[], scope: Scope): string {
    const dates: string[] = series
        .filter((item: AlertSeries): boolean => item.id === alert.seriesId || item.id === alert.fingerprint)
        .map((item: AlertSeries): string => latestChargeDate(item, scope));
    return dates.toSorted((left: string, right: string): number => left.localeCompare(right)).at(-1) ?? scope.today;
}
