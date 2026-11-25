import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { Holding, PortfolioSnapshot } from '../../portfolio/services/portfolio-snapshot.service';
import { MonthlySnapshotEntry } from './portfolio-watch.types';

const FIXED_INCOME_KIND: string = 'fixed_income';

function keyOf(holding: Holding): string {
    return holding.kind === FIXED_INCOME_KIND ? holding.id : (holding.assetId ?? holding.id);
}

function sumQuantity(left: string | null, right: string | null): string | null {
    if (left === null || right === null) {
        return left ?? right;
    }
    return DecimalUtil.of(left).add(right).toFixed();
}

function entryOf(holding: Holding, currency: string): MonthlySnapshotEntry {
    return {
        assetId: keyOf(holding),
        holdingKind: holding.kind,
        classId: holding.classId,
        quantity: holding.kind === FIXED_INCOME_KIND ? null : holding.quantity,
        price: holding.unitPrice,
        priceDate: holding.priceDate,
        valueMinor: holding.valueMinor,
        currency
    };
}

function merged(kept: MonthlySnapshotEntry, folded: MonthlySnapshotEntry): MonthlySnapshotEntry {
    return {
        ...kept,
        quantity: sumQuantity(kept.quantity, folded.quantity),
        valueMinor: kept.valueMinor + folded.valueMinor,
        price: kept.price ?? folded.price,
        priceDate: kept.priceDate ?? folded.priceDate
    };
}

export function monthlySnapshotEntriesOf(snapshot: PortfolioSnapshot): MonthlySnapshotEntry[] {
    const byKey: Map<string, MonthlySnapshotEntry> = new Map();
    for (const holding of snapshot.holdings) {
        if (holding.isSample || holding.isZeroQuantity) {
            continue;
        }
        const entry: MonthlySnapshotEntry = entryOf(holding, snapshot.baseCurrency);
        const existing: MonthlySnapshotEntry | undefined = byKey.get(entry.assetId);
        byKey.set(entry.assetId, existing === undefined ? entry : merged(existing, entry));
    }
    return [...byKey.values()];
}

export function monthOf(today: string): string {
    return today.slice(0, 7);
}

export function monthsBefore(month: string, months: number): string {
    const [year, number]: number[] = month.split('-').map(Number) as [number, number];
    const index: number = year * 12 + (number - 1) - months;
    const cutoffYear: number = Math.floor(index / 12);
    return `${String(cutoffYear).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}
