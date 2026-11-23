import { collapseDuplicates, CadenceFit, fitCadence } from './cadence';
import { byDate, Charge, toCharge } from './charge';
import { selectEligible } from './eligible-transactions';
import { AmountProfile, profileAmounts } from './amount-profile';
import { ExpectedDay, expectDay } from './expected-day';
import { merchantKeyOf } from './merchant-key';
import { daysBetween, signedDaysBetween } from './recurring-dates';
import { isWithinRatio, mostFrequent, sortedUnique } from './recurring-math';
import {
    CADENCES,
    CONSUMPTION_CATEGORIES,
    CROSS_ACCOUNT_VALUE_TOLERANCE,
    DetectedSeries,
    DetectorTransaction,
    DUPLICATE_MAX_DAYS,
    SUBSCRIPTIONS_CATEGORY,
    TRIAL_LOOKBACK_DAYS,
    TRIAL_MAX_MINOR,
    VALUE_MODES
} from './recurring.types';
import { groupIntoBands } from './value-bands';

const DAILY_CADENCES: readonly string[] = [CADENCES.weekly, CADENCES.biweekly];

function groupByMerchant(transactions: readonly DetectorTransaction[]): ReadonlyMap<string, readonly Charge[]> {
    const groups: Map<string, Charge[]> = new Map<string, Charge[]>();
    for (const transaction of transactions) {
        const key: string | null = merchantKeyOf(transaction);
        if (key !== null) {
            groups.set(key, [...(groups.get(key) ?? []), toCharge(transaction)]);
        }
    }
    return groups;
}

function isKnownSubscription(charges: readonly Charge[]): boolean {
    return charges.some((charge: Charge): boolean => charge.transaction.dictionaryCategory === SUBSCRIPTIONS_CATEGORY);
}

function categoryOf(charges: readonly Charge[]): string | null {
    const own: string[] = [];
    const fromDictionary: string[] = [];
    for (const charge of charges) {
        if (charge.transaction.categoryKey !== null) {
            own.push(charge.transaction.categoryKey);
        }
        if (charge.transaction.dictionaryCategory !== null) {
            fromDictionary.push(charge.transaction.dictionaryCategory);
        }
    }
    return mostFrequent(own) ?? mostFrequent(fromDictionary);
}

function overlapsAcrossAccounts(sorted: readonly Charge[]): boolean {
    for (let index: number = 1; index < sorted.length; index += 1) {
        const previous: Charge | undefined = sorted[index - 1];
        const current: Charge | undefined = sorted[index];
        if (previous === undefined || current === undefined) {
            continue;
        }
        const otherAccount: boolean = previous.transaction.accountId !== current.transaction.accountId;
        const near: boolean = daysBetween(previous.transaction.date, current.transaction.date) <= DUPLICATE_MAX_DAYS;
        if (otherAccount && near && isWithinRatio(previous.amountMinor, current.amountMinor, CROSS_ACCOUNT_VALUE_TOLERANCE)) {
            return true;
        }
    }
    return false;
}

function splitByAccount(charges: readonly Charge[]): readonly (readonly Charge[])[] {
    const groups: Map<string, Charge[]> = new Map<string, Charge[]>();
    for (const charge of charges) {
        groups.set(charge.transaction.accountId, [...(groups.get(charge.transaction.accountId) ?? []), charge]);
    }
    return [...groups.values()];
}

function isAllowedProfile(profile: AmountProfile, category: string | null): boolean {
    const consumption: boolean = category !== null && CONSUMPTION_CATEGORIES.includes(category);
    return !consumption || profile.mode === VALUE_MODES.fixed;
}

function buildSeries(merchantKey: string, fit: CadenceFit, profile: AmountProfile, duplicates: readonly Charge[]): DetectedSeries {
    const sorted: readonly Charge[] = fit.charges;
    const firstDate: string = sorted[0]?.transaction.date ?? '';
    const accountIds: readonly string[] = sortedUnique(sorted.map((charge: Charge): string => charge.transaction.accountId));
    const dated: ExpectedDay | null = DAILY_CADENCES.includes(fit.cadence) ? null : expectDay(sorted);
    return {
        merchantKey,
        cadence: fit.cadence,
        valueMode: profile.mode,
        typicalAmountMinor: profile.typicalAmountMinor,
        minAmountMinor: profile.minAmountMinor,
        maxAmountMinor: profile.maxAmountMinor,
        expectedDay: dated?.expectedDay ?? null,
        dayChange: dated?.dayChange ?? null,
        chargeIds: sorted.map((charge: Charge): string => charge.transaction.id),
        duplicateChargeIds: duplicates
            .filter((charge: Charge): boolean => charge.transaction.date >= firstDate)
            .map((charge: Charge): string => charge.transaction.id),
        trialChargeIds: [],
        accountId: mostFrequent(sorted.map((charge: Charge): string => charge.transaction.accountId)) ?? '',
        accountIds,
        categoryKey: categoryOf(sorted),
        knownSubscription: isKnownSubscription(sorted),
        firstDate,
        lastDate: sorted[sorted.length - 1]?.transaction.date ?? ''
    };
}

function detectGroup(merchantKey: string, charges: readonly Charge[]): DetectedSeries | null {
    const collapsed: ReturnType<typeof collapseDuplicates> = collapseDuplicates(charges);
    const fit: CadenceFit | null = fitCadence(collapsed.kept, isKnownSubscription(charges));
    if (fit === null) {
        return null;
    }
    const profile: AmountProfile | null = profileAmounts(fit.charges.map((charge: Charge): number => charge.amountMinor));
    if (profile === null || !isAllowedProfile(profile, categoryOf(fit.charges))) {
        return null;
    }
    return buildSeries(merchantKey, fit, profile, collapsed.duplicates);
}

function detectBand(merchantKey: string, band: readonly Charge[]): readonly DetectedSeries[] {
    const sorted: readonly Charge[] = [...band].sort(byDate);
    const groups: readonly (readonly Charge[])[] = overlapsAcrossAccounts(sorted) ? splitByAccount(sorted) : [sorted];
    const found: DetectedSeries[] = [];
    for (const group of groups) {
        const series: DetectedSeries | null = detectGroup(merchantKey, group);
        if (series !== null) {
            found.push(series);
        }
    }
    return found;
}

function isTrialFor(charge: Charge, series: DetectedSeries): boolean {
    const before: number = signedDaysBetween(charge.transaction.date, series.firstDate);
    return charge.amountMinor <= TRIAL_MAX_MINOR && series.minAmountMinor > TRIAL_MAX_MINOR && before > 0 && before <= TRIAL_LOOKBACK_DAYS;
}

function attachTrials(series: DetectedSeries, charges: readonly Charge[], used: ReadonlySet<string>): DetectedSeries {
    const trialChargeIds: string[] = [];
    for (const charge of charges) {
        if (!used.has(charge.transaction.id) && isTrialFor(charge, series)) {
            trialChargeIds.push(charge.transaction.id);
        }
    }
    return { ...series, trialChargeIds };
}

function detectMerchant(merchantKey: string, charges: readonly Charge[]): readonly DetectedSeries[] {
    const found: DetectedSeries[] = [];
    for (const band of groupIntoBands(charges)) {
        found.push(...detectBand(merchantKey, band));
    }
    const used: Set<string> = new Set<string>(found.flatMap((series: DetectedSeries): readonly string[] => series.chargeIds));
    return found.map((series: DetectedSeries): DetectedSeries => attachTrials(series, charges, used));
}

function bySeriesOrder(left: DetectedSeries, right: DetectedSeries): number {
    return (
        left.merchantKey.localeCompare(right.merchantKey) ||
        left.minAmountMinor - right.minAmountMinor ||
        left.accountId.localeCompare(right.accountId)
    );
}

export function detectRecurring(transactions: readonly DetectorTransaction[]): readonly DetectedSeries[] {
    const found: DetectedSeries[] = [];
    for (const [merchantKey, charges] of groupByMerchant(selectEligible(transactions))) {
        found.push(...detectMerchant(merchantKey, charges));
    }
    return found.sort(bySeriesOrder);
}
