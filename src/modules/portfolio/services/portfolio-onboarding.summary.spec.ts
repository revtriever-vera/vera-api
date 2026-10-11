import { beforeAll, describe, expect, it, vi } from 'vitest';
import { makePrototypeSource } from '../../../../test/support/portfolio-fixtures';
import { AppContext, AppContextData } from '../../../core/context/app-context.port';
import { ContextHolder } from '../../../core/context/as-company.decorator';
import { PortfolioSourceData, SourcePosition, SourceTitle } from '../domain/portfolio.types';
import { PortfolioSourcePort } from '../ports/portfolio-source.port';
import { PortfolioLogService } from './portfolio-log.service';
import { PortfolioMetricsService } from './portfolio-metrics.service';
import { PortfolioOnboardingSummary } from './portfolio-onboarding.summary';
import { PortfolioSnapshotService } from './portfolio-snapshot.service';

const runs: AppContextData[] = [];

function summaryOf(source: PortfolioSourceData): PortfolioOnboardingSummary {
    const port: PortfolioSourcePort = { load: (): Promise<PortfolioSourceData> => Promise.resolve(source) };
    const logs: unknown = { snapshot: (): void => undefined, orphanHolding: (): void => undefined };
    const metrics: unknown = { snapshotDuration: (): void => undefined, missingQuotes: (): void => undefined };
    return new PortfolioOnboardingSummary(
        new PortfolioSnapshotService(port, logs as PortfolioLogService, metrics as PortfolioMetricsService)
    );
}

function onlySample(items: readonly (SourcePosition | SourceTitle)[]): { isSample: boolean }[] {
    return items.map((item: SourcePosition | SourceTitle) => ({ ...item, isSample: true }));
}

describe('PortfolioOnboardingSummary', () => {
    const full: PortfolioSourceData = makePrototypeSource();

    beforeAll(() => {
        const context: AppContext = {
            run: <T>(data: AppContextData, fn: () => T): T => {
                runs.push(data);
                return fn();
            },
            get: (): AppContextData => ({ requestId: 'r', locale: 'pt-BR' }),
            getOrNull: (): AppContextData | null => null,
            enrich: vi.fn()
        };
        ContextHolder.set(context);
    });

    it('is the assets area port', () => {
        expect(summaryOf(full).area).toBe('assets');
    });

    it('counts positions and fixed income titles together, valued in the base currency', async () => {
        const result = await summaryOf(full).summarize('company-1');

        expect(result.items).toBe(full.positions.length + full.titles.length);
        expect(result.amountCents).toBeGreaterThan(0);
        expect(result.currency).toBe('BRL');
    });

    it('runs inside the tenant of the given company', async () => {
        runs.length = 0;

        await summaryOf(full).summarize('company-9');

        expect(runs[0]?.companyId).toBe('company-9');
    });

    it('counts a portfolio with only fixed income instead of showing zero', async () => {
        const result = await summaryOf({ ...full, positions: [], assets: [], quotes: [] }).summarize('company-1');

        expect(result.items).toBe(full.titles.length);
        expect(result.amountCents).toBeGreaterThan(0);
    });

    it('leaves sample positions and titles out of the count and the value', async () => {
        const [position] = full.positions as [SourcePosition];
        const [title] = full.titles as [SourceTitle];
        const real = await summaryOf({ ...full, positions: [position], titles: [title] }).summarize('company-1');
        const mixed = await summaryOf({
            ...full,
            positions: [position, ...(onlySample(full.positions.slice(1)) as SourcePosition[])],
            titles: [title, ...(onlySample(full.titles.slice(1)) as SourceTitle[])]
        }).summarize('company-1');

        expect(mixed).toEqual(real);
        expect(mixed.items).toBe(2);
    });

    it('reports a portfolio of only samples as empty with null value and currency', async () => {
        const result = await summaryOf({
            ...full,
            positions: onlySample(full.positions) as SourcePosition[],
            titles: onlySample(full.titles) as SourceTitle[]
        }).summarize('company-1');

        expect(result).toEqual({ items: 0, amountCents: null, currency: null });
    });

    it('ignores positions held with zero quantity', async () => {
        const [first] = full.positions as [SourcePosition];

        const result = await summaryOf({ ...full, positions: [{ ...first, quantity: '0' }], titles: [] }).summarize('company-1');

        expect(result.items).toBe(0);
    });

    it('reports an empty portfolio as zero items with null value and currency', async () => {
        const result = await summaryOf({ ...full, positions: [], titles: [] }).summarize('company-1');

        expect(result).toEqual({ items: 0, amountCents: null, currency: null });
    });
});
