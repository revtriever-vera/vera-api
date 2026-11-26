import { describe, expect, it } from 'vitest';
import { PortfolioSnapshot } from '../../portfolio/services/portfolio-snapshot.service';
import { heldAssetsOf } from './portfolio-changes-held-assets';

function holding(assetId: string | null, symbol: string, valueMinor: number, extra: Record<string, unknown> = {}): unknown {
    return {
        kind: 'position',
        id: `${symbol}-${String(valueMinor)}`,
        assetId,
        symbol,
        classId: 'stocks',
        valueMinor,
        isSample: false,
        isZeroQuantity: false,
        ...extra
    };
}

function snapshot(holdings: unknown[], totalMinor: number): PortfolioSnapshot {
    return { holdings, totalMinor } as unknown as PortfolioSnapshot;
}

describe('heldAssetsOf', () => {
    it('soma as posições do mesmo ativo e calcula o peso sobre a carteira toda', () => {
        const held = heldAssetsOf(
            snapshot([holding('a', 'AAAA3', 600), holding('a', 'AAAA3', 200), holding('b', 'BBBB3', 200)], 1000),
            null
        );

        expect(held.get('a')).toEqual({ assetId: 'a', symbol: 'AAAA3', weightBps: 8000 });
        expect(held.get('b')).toEqual({ assetId: 'b', symbol: 'BBBB3', weightBps: 2000 });
    });

    it('descarta título, amostra e posição zerada e filtra pela classe sem mudar o peso', () => {
        const held = heldAssetsOf(
            snapshot(
                [
                    holding(null, 'CDB', 100),
                    holding('s', 'SAMP3', 100, { isSample: true }),
                    holding('z', 'ZERO3', 0, { isZeroQuantity: true }),
                    holding('a', 'AAAA3', 500),
                    holding('f', 'FIIX11', 400, { classId: 'fiis' })
                ],
                1000
            ),
            'fiis'
        );

        expect([...held.keys()]).toEqual(['f']);
        expect(held.get('f')?.weightBps).toBe(4000);
    });

    it('ativo sem valor fica sem peso', () => {
        const held = heldAssetsOf(snapshot([holding('a', 'AAAA3', 0)], 1000), null);

        expect(held.get('a')?.weightBps).toBeNull();
    });
});
