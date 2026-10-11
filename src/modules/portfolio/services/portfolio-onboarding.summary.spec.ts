import { describe, expect, it } from 'vitest';
import { makePrototypeSource } from '../../../../test/support/portfolio-fixtures';
import { PortfolioSourceData } from '../domain/portfolio.types';
import { PortfolioSourcePort } from '../ports/portfolio-source.port';
import { PortfolioLogService } from './portfolio-log.service';
import { PortfolioMetricsService } from './portfolio-metrics.service';
import { PortfolioOnboardingSummary } from './portfolio-onboarding.summary';
import { PortfolioSnapshotService } from './portfolio-snapshot.service';

function summaryOf(source: PortfolioSourceData): PortfolioOnboardingSummary {
    const port: PortfolioSourcePort = { load: (): Promise<PortfolioSourceData> => Promise.resolve(source) };
    const logs: unknown = { snapshot: (): void => undefined, orphanHolding: (): void => undefined };
    const metrics: unknown = { snapshotDuration: (): void => undefined, missingQuotes: (): void => undefined };
    return new PortfolioOnboardingSummary(
        new PortfolioSnapshotService(port, logs as PortfolioLogService, metrics as PortfolioMetricsService)
    );
}

describe('PortfolioOnboardingSummary', () => {
    const full: PortfolioSourceData = makePrototypeSource();

    it('is the assets area port', () => {
        expect(summaryOf(full).area).toBe('assets');
    });

    it('counts positions and fixed income titles together, valued in the base currency', async () => {
        const result = await summaryOf(full).summarize();

        expect(result.items).toBe(full.positions.length + full.titles.length);
        expect(result.amountCents).toBeGreaterThan(0);
        expect(result.currency).toBe('BRL');
    });

    it('counts a portfolio with only fixed income instead of showing zero', async () => {
        const result = await summaryOf({ ...full, positions: [], assets: [], quotes: [] }).summarize();

        expect(result.items).toBe(full.titles.length);
        expect(result.amountCents).toBeGreaterThan(0);
    });

    it('ignores positions held with zero quantity', async () => {
        const [first] = full.positions;
        const result = await summaryOf({ ...full, positions: [{ ...first!, quantity: '0' }], titles: [] }).summarize();

        expect(result.items).toBe(0);
    });

    it('reports an empty portfolio as zero items and zero value', async () => {
        const result = await summaryOf({ ...full, positions: [], titles: [] }).summarize();

        expect(result).toEqual({ items: 0, amountCents: 0, currency: 'BRL' });
    });
});
