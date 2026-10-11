import { describe, expect, it, vi } from 'vitest';
import { classIdOf, makePrototypeSource } from '../../../../test/support/portfolio-fixtures';
import { buildSnapshot } from '../domain/portfolio-snapshot';
import { PortfolioClassNotFoundError } from '../domain/portfolio.errors';
import { PortfolioSnapshotService } from '../services/portfolio-snapshot.service';
import { PortfolioViewApplication } from './portfolio-view.application';

function application(): PortfolioViewApplication {
    const snapshots = { build: vi.fn().mockResolvedValue(buildSnapshot(makePrototypeSource())) };
    return new PortfolioViewApplication(snapshots as unknown as PortfolioSnapshotService);
}

describe('PortfolioViewApplication', () => {
    it('returns the holdings with the base currency', async () => {
        const response = await application().holdings();

        expect(response.baseCurrency).toBe('BRL');
        expect(response.data).toHaveLength(19);
    });

    it('returns the overview with the classes, the exposure and the largest deviation', async () => {
        const response = await application().overview();

        expect(response).toMatchObject({ empty: false, totalMinor: 177_310_040, outsideCount: 1, toleranceBps: 500 });
        expect(response.dollarExposure.shareBps).toBe(4743);
        expect(response.largestDeviation?.classId).toBe(classIdOf('cripto'));
        expect(response.classes).toHaveLength(8);
    });

    it('returns the class detail with effective targets, shares inside the class and the gap', async () => {
        const response = await application().classDetail(classIdOf('acoes_br'));

        expect(response.class.valueMinor).toBe(22_017_000);
        expect(response.targetsSumBps).toBe(0);
        expect(response.assets.map((asset) => asset.symbol)).toEqual(['WEGE3', 'ITUB4', 'PETR4']);
        const shares: number[] = response.assets.map((asset) => asset.shareInClassBps);
        expect(shares.reduce((sum, value) => sum + value, 0)).toBe(10000);
        expect(response.assets.map((asset) => asset.targetInClassBps).toSorted()).toEqual([3333, 3333, 3334]);
        const first = response.assets[0];
        expect(first?.deviationBps).toBe((first?.shareInClassBps ?? 0) - (first?.targetInClassBps ?? 0));
    });

    it('throws not found for a class outside the company', async () => {
        await expect(application().classDetail('unknown')).rejects.toBeInstanceOf(PortfolioClassNotFoundError);
    });
});
