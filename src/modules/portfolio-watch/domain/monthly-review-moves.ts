import Decimal from 'decimal.js';
import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { OPERATION_KIND_NAMES, PriceMove, ReviewOperation } from './monthly-review.types';
import { MonthlySnapshotEntry } from './portfolio-watch.types';

export const MOVES_LIMIT: number = 3;
const PERCENT: number = 100;
const PCT_DECIMALS: number = 2;
const POSITION_KIND: string = 'position';
const EVENT_KINDS: ReadonlySet<string> = new Set([
    OPERATION_KIND_NAMES.split,
    OPERATION_KIND_NAMES.reverseSplit,
    OPERATION_KIND_NAMES.bonus
]);

function pricedPositions(entries: readonly MonthlySnapshotEntry[]): Map<string, MonthlySnapshotEntry> {
    const priced: Map<string, MonthlySnapshotEntry> = new Map();
    for (const entry of entries) {
        if (entry.holdingKind === POSITION_KIND && entry.price !== null && DecimalUtil.of(entry.price).gt(0)) {
            priced.set(entry.assetId, entry);
        }
    }
    return priced;
}

function movedBy(operations: readonly ReviewOperation[]): ReadonlySet<string> {
    return new Set(
        operations.filter((operation: ReviewOperation): boolean => EVENT_KINDS.has(operation.kind)).map((operation) => operation.assetId)
    );
}

function moveOf(start: MonthlySnapshotEntry, end: MonthlySnapshotEntry): PriceMove | null {
    if (start.currency !== end.currency || end.price === null || start.price === null) {
        return null;
    }
    const variation: Decimal = DecimalUtil.of(end.price).sub(start.price).div(start.price).mul(PERCENT);
    return { assetId: end.assetId, variationPct: variation.toDecimalPlaces(PCT_DECIMALS, Decimal.ROUND_HALF_UP).toNumber() };
}

export function priceMovesOf(
    start: readonly MonthlySnapshotEntry[],
    end: readonly MonthlySnapshotEntry[],
    operations: readonly ReviewOperation[]
): PriceMove[] {
    const before: Map<string, MonthlySnapshotEntry> = pricedPositions(start);
    const skipped: ReadonlySet<string> = movedBy(operations);
    const moves: PriceMove[] = [];
    for (const [assetId, entry] of pricedPositions(end)) {
        const previous: MonthlySnapshotEntry | undefined = before.get(assetId);
        const move: PriceMove | null = previous === undefined || skipped.has(assetId) ? null : moveOf(previous, entry);
        if (move !== null) {
            moves.push(move);
        }
    }
    return moves;
}

export function topGainersOf(moves: readonly PriceMove[]): PriceMove[] {
    return moves
        .filter((move: PriceMove): boolean => move.variationPct > 0)
        .sort((left: PriceMove, right: PriceMove): number => right.variationPct - left.variationPct)
        .slice(0, MOVES_LIMIT);
}

export function topLosersOf(moves: readonly PriceMove[]): PriceMove[] {
    return moves
        .filter((move: PriceMove): boolean => move.variationPct < 0)
        .sort((left: PriceMove, right: PriceMove): number => left.variationPct - right.variationPct)
        .slice(0, MOVES_LIMIT);
}
