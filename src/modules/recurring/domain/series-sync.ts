import { isOverdue, kindOf } from './series-lifecycle';
import { isWithinRatio } from './recurring-math';
import {
    ChargeDiff,
    CHARGE_ROLES,
    DesiredCharge,
    DetectedFields,
    SERIES_STATUSES,
    StoredCharge,
    StoredSeries,
    StoredSuppression,
    STOPPED_BY
} from './recurring-series.types';
import { BAND_TOLERANCE, DetectedSeries } from './recurring.types';

export type SeriesAction =
    | { readonly kind: 'create'; readonly detected: DetectedSeries }
    | { readonly kind: 'refresh'; readonly id: string; readonly detected: DetectedSeries; readonly reactivate: boolean }
    | { readonly kind: 'remove'; readonly id: string }
    | { readonly kind: 'stop'; readonly id: string };

function overlapOf(detected: DetectedSeries, stored: StoredSeries): number {
    return detected.chargeIds.filter((id: string): boolean => stored.chargeIds.has(id)).length;
}

function distanceOf(detected: DetectedSeries, stored: StoredSeries): number {
    return Math.abs(detected.typicalAmountMinor - stored.typicalAmountMinor);
}

function sameBand(detected: DetectedSeries, stored: StoredSeries): boolean {
    return (
        stored.merchantKey === detected.merchantKey &&
        stored.accountId === detected.accountId &&
        isWithinRatio(stored.typicalAmountMinor, detected.typicalAmountMinor, BAND_TOLERANCE)
    );
}

function closest(
    detected: DetectedSeries,
    candidates: readonly StoredSeries[],
    rank: (stored: StoredSeries) => number
): StoredSeries | null {
    let best: StoredSeries | null = null;
    let bestRank: number = Number.NEGATIVE_INFINITY;
    for (const stored of candidates) {
        const current: number = rank(stored) * 1_000_000_000 - distanceOf(detected, stored);
        if (current > bestRank) {
            best = stored;
            bestRank = current;
        }
    }
    return best;
}

export function matchStored(detected: DetectedSeries, candidates: readonly StoredSeries[]): StoredSeries | null {
    const overlapping: StoredSeries[] = candidates.filter((stored: StoredSeries): boolean => overlapOf(detected, stored) > 0);
    if (overlapping.length > 0) {
        return closest(detected, overlapping, (stored: StoredSeries): number => overlapOf(detected, stored));
    }
    return closest(
        detected,
        candidates.filter((stored: StoredSeries): boolean => sameBand(detected, stored)),
        (): number => 0
    );
}

export function isSuppressed(detected: DetectedSeries, suppressions: readonly StoredSuppression[]): boolean {
    return suppressions.some(
        (suppression: StoredSuppression): boolean =>
            suppression.merchantKey === detected.merchantKey &&
            isWithinRatio(suppression.typicalAmountMinor, detected.typicalAmountMinor, BAND_TOLERANCE)
    );
}

function refreshOf(detected: DetectedSeries, stored: StoredSeries, today: string): SeriesAction[] {
    if (stored.status === SERIES_STATUSES.dismissed) {
        return [];
    }
    const reactivate: boolean =
        stored.status === SERIES_STATUSES.stopped && stored.stoppedBy === STOPPED_BY.auto && detected.lastDate > stored.lastDate;
    const actions: SeriesAction[] = [{ kind: 'refresh', id: stored.id, detected, reactivate }];
    const confirmed: boolean = stored.status === SERIES_STATUSES.confirmed;
    return confirmed && isOverdue(detected.lastDate, stored.cadence, today) ? [...actions, { kind: 'stop', id: stored.id }] : actions;
}

function leftoverOf(stored: StoredSeries, today: string): SeriesAction[] {
    if (stored.status === SERIES_STATUSES.suggested) {
        return [{ kind: 'remove', id: stored.id }];
    }
    const overdue: boolean = stored.status === SERIES_STATUSES.confirmed && isOverdue(stored.lastDate, stored.cadence, today);
    return overdue ? [{ kind: 'stop', id: stored.id }] : [];
}

function planDetected(
    series: DetectedSeries,
    free: Map<string, StoredSeries>,
    suppressions: readonly StoredSuppression[],
    today: string
): SeriesAction[] {
    const match: StoredSeries | null = matchStored(series, [...free.values()]);
    if (match === null) {
        return isSuppressed(series, suppressions) ? [] : [{ kind: 'create', detected: series }];
    }
    free.delete(match.id);
    return refreshOf(series, match, today);
}

export function planSync(
    detected: readonly DetectedSeries[],
    stored: readonly StoredSeries[],
    suppressions: readonly StoredSuppression[],
    today: string
): SeriesAction[] {
    const free: Map<string, StoredSeries> = new Map<string, StoredSeries>(
        stored.map((series: StoredSeries): [string, StoredSeries] => [series.id, series])
    );
    const actions: SeriesAction[] = [];
    for (const series of detected) {
        actions.push(...planDetected(series, free, suppressions, today));
    }
    for (const leftover of free.values()) {
        actions.push(...leftoverOf(leftover, today));
    }
    return actions;
}

export function desiredChargesOf(detected: DetectedSeries): readonly DesiredCharge[] {
    return [
        ...detected.chargeIds.map((transactionId: string): DesiredCharge => ({ transactionId, role: CHARGE_ROLES.charge })),
        ...detected.duplicateChargeIds.map((transactionId: string): DesiredCharge => ({ transactionId, role: CHARGE_ROLES.duplicate })),
        ...detected.trialChargeIds.map((transactionId: string): DesiredCharge => ({ transactionId, role: CHARGE_ROLES.trial }))
    ];
}

export function diffCharges(existing: readonly StoredCharge[], desired: readonly DesiredCharge[]): ChargeDiff {
    const wanted: Map<string, DesiredCharge> = new Map<string, DesiredCharge>(
        desired.map((charge: DesiredCharge): [string, DesiredCharge] => [charge.transactionId, charge])
    );
    const live: StoredCharge[] = existing.filter((row: StoredCharge): boolean => row.role !== CHARGE_ROLES.excluded);
    const isKept: (row: StoredCharge) => boolean = (row: StoredCharge): boolean => wanted.get(row.transactionId)?.role === row.role;
    const kept: Set<string> = new Set<string>(live.filter(isKept).map((row: StoredCharge): string => row.transactionId));
    const removeIds: string[] = live.filter((row: StoredCharge): boolean => !isKept(row)).map((row: StoredCharge): string => row.id);
    const excluded: Set<string> = new Set<string>(
        existing
            .filter((row: StoredCharge): boolean => row.role === CHARGE_ROLES.excluded)
            .map((row: StoredCharge): string => row.transactionId)
    );
    return {
        insert: desired.filter((charge: DesiredCharge): boolean => !kept.has(charge.transactionId) && !excluded.has(charge.transactionId)),
        removeIds
    };
}

export function detectedFieldsOf(detected: DetectedSeries): DetectedFields {
    return {
        cadence: detected.cadence,
        valueMode: detected.valueMode,
        expectedDay: detected.expectedDay,
        accountId: detected.accountId,
        kind: kindOf(detected.categoryKey, detected.knownSubscription),
        typicalAmountMinor: detected.typicalAmountMinor,
        minAmountMinor: detected.minAmountMinor,
        maxAmountMinor: detected.maxAmountMinor,
        dayChange: detected.dayChange,
        knownSubscription: detected.knownSubscription,
        firstDate: detected.firstDate,
        lastDate: detected.lastDate
    };
}
