import { AmountProfile, profileAmounts } from './amount-profile';
import { merchantKeyOf } from './merchant-key';
import { isWithinRatio, mostFrequent } from './recurring-math';
import { DesiredCharge, CHARGE_ROLES, SeriesFields, SERIES_ORIGINS, SERIES_STATUSES } from './recurring-series.types';
import { expectedDayFor, guessCadence, kindOf } from './series-lifecycle';
import { BAND_TOLERANCE, DetectorTransaction, SUBSCRIPTIONS_CATEGORY, VALUE_MODES } from './recurring.types';

export interface ManualSeries {
    readonly fields: Omit<SeriesFields, 'name'>;
    readonly charges: readonly DesiredCharge[];
}

function byDateThenId(left: DetectorTransaction, right: DetectorTransaction): number {
    return left.date.localeCompare(right.date) || left.id.localeCompare(right.id);
}

function isSimilar(candidate: DetectorTransaction, target: DetectorTransaction, key: string): boolean {
    return (
        candidate.id === target.id ||
        (candidate.amountMinor < 0 &&
            candidate.categoryKind !== 'transfer' &&
            candidate.installmentTotal === null &&
            merchantKeyOf(candidate) === key &&
            isWithinRatio(-candidate.amountMinor, -target.amountMinor, BAND_TOLERANCE))
    );
}

export function manualKeyOf(target: DetectorTransaction): string {
    const key: string | null = merchantKeyOf(target);
    return key ?? (target.normalizedDescription.trim().length > 0 ? target.normalizedDescription.trim() : target.id);
}

function profileOf(similar: readonly DetectorTransaction[], target: DetectorTransaction): AmountProfile {
    const amounts: readonly number[] = similar.map((transaction: DetectorTransaction): number => -transaction.amountMinor);
    const profiled: AmountProfile | null = profileAmounts(amounts);
    if (profiled !== null) {
        return profiled;
    }
    const single: number = -target.amountMinor;
    return { mode: VALUE_MODES.fixed, typicalAmountMinor: single, minAmountMinor: single, maxAmountMinor: single };
}

function categoryOf(similar: readonly DetectorTransaction[]): string | null {
    const own: string[] = similar.flatMap((item: DetectorTransaction): string[] => (item.categoryKey === null ? [] : [item.categoryKey]));
    return (
        mostFrequent(own) ??
        mostFrequent(
            similar.flatMap((item: DetectorTransaction): string[] => (item.dictionaryCategory === null ? [] : [item.dictionaryCategory]))
        )
    );
}

function amountFieldsOf(
    profile: AmountProfile
): Pick<ManualSeries['fields'], 'valueMode' | 'typicalAmountMinor' | 'minAmountMinor' | 'maxAmountMinor'> {
    return {
        valueMode: profile.mode,
        typicalAmountMinor: profile.typicalAmountMinor,
        minAmountMinor: profile.minAmountMinor,
        maxAmountMinor: profile.maxAmountMinor
    };
}

function fieldsOf(key: string, target: DetectorTransaction, similar: readonly DetectorTransaction[], now: Date): ManualSeries['fields'] {
    const dates: string[] = similar.map((item: DetectorTransaction): string => item.date);
    const cadence: ReturnType<typeof guessCadence> = guessCadence(dates);
    const known: boolean = similar.some((item: DetectorTransaction): boolean => item.dictionaryCategory === SUBSCRIPTIONS_CATEGORY);
    return {
        ...amountFieldsOf(profileOf(similar, target)),
        merchantKey: key,
        accountId: target.accountId,
        cadence,
        kind: kindOf(categoryOf(similar), known, false),
        status: SERIES_STATUSES.confirmed,
        origin: SERIES_ORIGINS.manual,
        expectedDay: expectedDayFor(cadence, target.date),
        dayChange: null,
        knownSubscription: known,
        firstDate: dates[0] ?? target.date,
        lastDate: dates.at(-1) ?? target.date,
        confirmedAt: now
    };
}

export function buildManualSeries(target: DetectorTransaction, pool: readonly DetectorTransaction[], now: Date): ManualSeries {
    const key: string = manualKeyOf(target);
    const similar: DetectorTransaction[] = pool
        .filter((candidate: DetectorTransaction): boolean => isSimilar(candidate, target, key))
        .sort(byDateThenId);
    return {
        fields: fieldsOf(key, target, similar, now),
        charges: similar.map((item: DetectorTransaction): DesiredCharge => ({ transactionId: item.id, role: CHARGE_ROLES.charge }))
    };
}
