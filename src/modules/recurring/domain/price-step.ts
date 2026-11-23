import { byDate, Charge } from './charge';
import { CADENCE_RULES } from './cadence';
import { signedDaysBetween } from './recurring-dates';

const MIN_BAND_CHARGES: number = 2;

function sortedByDate(band: readonly Charge[]): readonly Charge[] {
    return [...band].sort(byDate);
}

function firstDateOf(band: readonly Charge[]): string {
    return sortedByDate(band)[0]?.transaction.date ?? '';
}

function lastDateOf(band: readonly Charge[]): string {
    return sortedByDate(band).at(-1)?.transaction.date ?? '';
}

function accountOf(band: readonly Charge[]): string | null {
    const accounts: ReadonlySet<string> = new Set<string>(band.map((charge: Charge): string => charge.transaction.accountId));
    return accounts.size === 1 ? (band[0]?.transaction.accountId ?? null) : null;
}

function isCadenceGap(days: number): boolean {
    return CADENCE_RULES.some((rule: (typeof CADENCE_RULES)[number]): boolean => days >= rule.minDays && days <= rule.maxDays);
}

export function orderedByStart(bands: readonly (readonly Charge[])[]): readonly (readonly Charge[])[] {
    return [...bands].sort((left: readonly Charge[], right: readonly Charge[]): number =>
        firstDateOf(left).localeCompare(firstDateOf(right))
    );
}

/**
 * A price step: the later band starts after the earlier one stopped, in the same account, one
 * cadence interval later. Bands that charge in the same period (two plans) are never a step.
 */
export function isPriceStep(earlier: readonly Charge[], later: readonly Charge[]): boolean {
    const account: string | null = accountOf(earlier);
    const sizeOk: boolean = earlier.length >= MIN_BAND_CHARGES && later.length >= MIN_BAND_CHARGES;
    return (
        sizeOk &&
        account !== null &&
        account === accountOf(later) &&
        isCadenceGap(signedDaysBetween(lastDateOf(earlier), firstDateOf(later)))
    );
}
