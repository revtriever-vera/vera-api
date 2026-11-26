import { Holding, PortfolioSnapshot, sharesBpsOf } from '../../portfolio/services/portfolio-snapshot.service';
import { HeldAsset } from '../domain/portfolio-changes.types';

function isHeldPosition(holding: Holding, classId: string | null): boolean {
    return holding.assetId !== null && !holding.isSample && !holding.isZeroQuantity && (classId === null || holding.classId === classId);
}

function valueByAsset(holdings: readonly Holding[]): Map<string, { symbol: string; valueMinor: number }> {
    const totals: Map<string, { symbol: string; valueMinor: number }> = new Map<string, { symbol: string; valueMinor: number }>();
    for (const holding of holdings) {
        const assetId: string = holding.assetId ?? holding.id;
        const known: { symbol: string; valueMinor: number } | undefined = totals.get(assetId);
        totals.set(assetId, { symbol: holding.symbol, valueMinor: (known?.valueMinor ?? 0) + holding.valueMinor });
    }
    return totals;
}

export function heldAssetsOf(snapshot: PortfolioSnapshot, classId: string | null): Map<string, HeldAsset> {
    const held: Holding[] = snapshot.holdings.filter((holding: Holding): boolean => isHeldPosition(holding, classId));
    const totals: Map<string, { symbol: string; valueMinor: number }> = valueByAsset(held);
    const assetIds: string[] = [...totals.keys()];
    const shares: number[] = sharesBpsOf(
        assetIds.map((assetId: string): number => totals.get(assetId)?.valueMinor ?? 0),
        snapshot.totalMinor
    );
    return new Map(
        assetIds.map((assetId: string, index: number): [string, HeldAsset] => {
            const total: { symbol: string; valueMinor: number } | undefined = totals.get(assetId);
            const weightBps: number = shares[index] ?? 0;
            return [
                assetId,
                { assetId, symbol: total?.symbol ?? assetId, weightBps: total === undefined || total.valueMinor <= 0 ? null : weightBps }
            ];
        })
    );
}
