import { describe, expect, it, vi } from 'vitest';
import { FgcCoverage } from '../domain/fgc.types';
import { FgcCoverageService } from '../services/fgc-coverage.service';
import { FgcLogService } from '../services/fgc-log.service';
import { FgcMetricsService } from '../services/fgc-metrics.service';
import { FgcCoverageApplication } from './fgc-coverage.application';
import { FgcSimulationApplication } from './fgc-simulation.application';

const COVERAGE: FgcCoverage = {
    currency: 'BRL',
    scope: 'account',
    peopleCount: 1,
    limitPerGroupMinor: 25_000_000,
    capMinor: 100_000_000,
    coveredMinor: 0,
    capShareBps: 0,
    groups: [
        { groupId: 'a', groupName: 'A', totalMinor: 26_000_000, coveredMinor: 25_000_000, overMinor: 1_000_000, titles: [] },
        { groupId: 'b', groupName: 'B', totalMinor: 1, coveredMinor: 1, overMinor: 0, titles: [] }
    ],
    outside: [],
    asOf: '2026-01-05'
};

describe('FgcCoverageApplication', () => {
    it('answers the coverage, counts the request and logs the group counts', async () => {
        const logs = { computed: vi.fn() };
        const metrics = { request: vi.fn(), overLimitGroups: vi.fn() };
        const application = new FgcCoverageApplication(
            { coverage: vi.fn().mockResolvedValue(COVERAGE) } as unknown as FgcCoverageService,
            logs as unknown as FgcLogService,
            metrics as unknown as FgcMetricsService
        );

        expect(await application.get({})).toBe(COVERAGE);
        expect(metrics.request).toHaveBeenCalledWith('coverage');
        expect(metrics.overLimitGroups).toHaveBeenCalledWith(1);
        expect(logs.computed).toHaveBeenCalledWith(2, 1, 0);
    });

    it('refuses a holder', async () => {
        const application = new FgcCoverageApplication({} as FgcCoverageService, {} as FgcLogService, {} as FgcMetricsService);

        await expect(application.get({ holderId: 'x' })).rejects.toMatchObject({ code: 'fgc.holder_not_supported', status: 400 });
    });
});

describe('FgcSimulationApplication', () => {
    it('delegates to the service and counts the request', async () => {
        const result = { verdict: 'covered', groupId: 'a', groupName: 'A', totalAfterMinor: 1, overMinor: 0 };
        const request = vi.fn();
        const application = new FgcSimulationApplication(
            { simulate: vi.fn().mockResolvedValue(result) } as unknown as FgcCoverageService,
            { request } as unknown as FgcMetricsService
        );

        expect(await application.simulate({ issuerId: 'a', kind: 'cdb', valueMinor: 1 })).toBe(result);
        expect(request).toHaveBeenCalledWith('simulate');
    });
});
