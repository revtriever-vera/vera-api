import { describe, expect, it, vi } from 'vitest';
import { makePrototypeSource } from '../../../../test/support/portfolio-fixtures';
import { PortfolioSourceData } from '../domain/portfolio.types';
import { PortfolioSourcePort } from '../ports/portfolio-source.port';
import { PortfolioLogService } from './portfolio-log.service';
import { PortfolioMetricsService } from './portfolio-metrics.service';
import { PortfolioSnapshotService } from './portfolio-snapshot.service';

function setup(source: PortfolioSourceData): {
    service: PortfolioSnapshotService;
    logs: { snapshot: ReturnType<typeof vi.fn>; orphanHolding: ReturnType<typeof vi.fn> };
    metrics: { snapshotDuration: ReturnType<typeof vi.fn>; missingQuotes: ReturnType<typeof vi.fn> };
} {
    const port: PortfolioSourcePort = { load: vi.fn().mockResolvedValue(source) };
    const logs = { snapshot: vi.fn(), orphanHolding: vi.fn() };
    const metrics = { snapshotDuration: vi.fn(), missingQuotes: vi.fn() };
    const service: PortfolioSnapshotService = new PortfolioSnapshotService(
        port,
        logs as unknown as PortfolioLogService,
        metrics as unknown as PortfolioMetricsService
    );
    return { service, logs, metrics };
}

describe('PortfolioSnapshotService', () => {
    it('builds the snapshot and logs only counts, never values or names', async () => {
        const { service, logs, metrics } = setup(makePrototypeSource({ withoutQuotes: ['PETR4'] }));

        const snapshot = await service.build();

        expect(snapshot.totalMinor).toBeGreaterThan(0);
        expect(logs.snapshot).toHaveBeenCalledWith({
            holdings: 19,
            classes: 8,
            missingQuotes: 1,
            staleQuotes: 0,
            durationMs: expect.any(Number)
        });
        expect(metrics.snapshotDuration).toHaveBeenCalledWith(expect.any(Number));
        expect(metrics.missingQuotes).toHaveBeenCalledWith(1);
        expect(logs.orphanHolding).not.toHaveBeenCalled();
    });

    it('logs an error for every holding without class', async () => {
        const source: PortfolioSourceData = makePrototypeSource();
        const { service, logs } = setup({ ...source, assignments: source.assignments.filter((item) => item.subjectId !== 'position-VOO') });

        await service.build();

        expect(logs.orphanHolding).toHaveBeenCalledExactlyOnceWith('position', 'position-VOO');
    });
});
