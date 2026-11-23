import { describe, expect, it, vi } from 'vitest';
import { ANY_HOLDER } from '../../../shared/holder/holder-filter';
import { MemberDirectoryService } from '../../identity/services/member-directory.service';
import { classIdOf, makePrototypeSource } from '../../../../test/support/portfolio-fixtures';
import { buildSnapshot } from '../domain/portfolio-snapshot';
import { PortfolioClassNotFoundError } from '../domain/portfolio.errors';
import { PortfolioMetricsService } from '../services/portfolio-metrics.service';
import { PortfolioSnapshotService } from '../services/portfolio-snapshot.service';
import { PortfolioViewApplication } from './portfolio-view.application';

const ANA: string = '0199a000-0000-7000-8000-000000000001';

function doubles(source = makePrototypeSource()) {
    const build = vi.fn().mockResolvedValue(buildSnapshot(source));
    const holderFilter = vi.fn();
    const instance: PortfolioViewApplication = new PortfolioViewApplication(
        { build } as unknown as PortfolioSnapshotService,
        { list: vi.fn().mockResolvedValue([{ userId: ANA, name: 'Ana' }]) } as unknown as MemberDirectoryService,
        { holderFilter } as unknown as PortfolioMetricsService
    );
    return { instance, build, holderFilter };
}

function application(): PortfolioViewApplication {
    return doubles().instance;
}

describe('PortfolioViewApplication', () => {
    it('returns the holdings with the base currency', async () => {
        const response = await application().holdings(ANY_HOLDER);

        expect(response.baseCurrency).toBe('BRL');
        expect(response.data).toHaveLength(19);
    });

    it('returns the overview with the classes, the exposure and the largest deviation', async () => {
        const response = await application().overview(ANY_HOLDER);

        expect(response).toMatchObject({ empty: false, totalMinor: 177_310_040, outsideCount: 1, toleranceBps: 500 });
        expect(response.dollarExposure.shareBps).toBe(4743);
        expect(response.largestDeviation?.classId).toBe(classIdOf('cripto'));
        expect(response.classes).toHaveLength(8);
    });

    it('returns the class detail with effective targets, shares inside the class and the gap', async () => {
        const response = await application().classDetail(classIdOf('acoes_br'), ANY_HOLDER);

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
        await expect(application().classDetail('unknown', ANY_HOLDER)).rejects.toBeInstanceOf(PortfolioClassNotFoundError);
    });

    it('passes the filter to the snapshot and counts it by kind', async () => {
        const { instance, build, holderFilter } = doubles();

        await instance.holdings({ kind: 'all' });
        await instance.overview({ kind: 'person', userId: ANA });
        await instance.classDetail(classIdOf('acoes_br'), ANY_HOLDER);

        expect(build.mock.calls.map((call: unknown[]) => call[0])).toEqual([{ kind: 'all' }, { kind: 'person', userId: ANA }, ANY_HOLDER]);
        expect(holderFilter.mock.calls).toEqual([['all'], ['person'], ['any']]);
    });

    it('names the holder of a holding, and reads a holder that is gone as the whole account', async () => {
        const source = makePrototypeSource();
        const { instance } = doubles({
            ...source,
            positions: source.positions.map((position, index) => ({
                ...position,
                holderUserId: index === 0 ? ANA : index === 1 ? 'gone' : null
            }))
        });

        const response = await instance.holdings(ANY_HOLDER);

        const holders = response.data.map((holding) => holding.holder);
        expect(holders).toContainEqual({ userId: ANA, name: 'Ana' });
        expect(holders.filter((holder) => holder !== null)).toHaveLength(1);
    });
});
