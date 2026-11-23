import { describe, expect, it, vi } from 'vitest';
import { DirectoryMember, MemberDirectoryService } from '../../identity/services/member-directory.service';
import { FgcCoverage } from '../domain/fgc.types';
import { FgcCoverageService } from '../services/fgc-coverage.service';
import { FgcLogService } from '../services/fgc-log.service';
import { FgcMetricsService } from '../services/fgc-metrics.service';
import { FgcCoverageApplication } from './fgc-coverage.application';
import { FgcSimulationApplication } from './fgc-simulation.application';

const ANA: string = '0199a000-0000-7000-8000-000000000001';
const MEMBERS: DirectoryMember[] = [{ userId: ANA, name: 'Ana' }];

const COVERAGE: FgcCoverage = {
    asOf: '2026-01-05',
    blocks: [
        {
            holderUserId: null,
            coveredMinor: 25_000_000,
            capShareBps: 2500,
            groups: [
                { groupId: 'a', groupName: 'A', totalMinor: 26_000_000, coveredMinor: 25_000_000, overMinor: 1_000_000, titles: [] },
                { groupId: 'b', groupName: 'B', totalMinor: 1, coveredMinor: 1, overMinor: 0, titles: [] }
            ],
            outside: []
        }
    ]
};

describe('FgcCoverageApplication', () => {
    it('answers the coverage of the holder asked for, counts the request and logs the group counts', async () => {
        const logs = { computed: vi.fn() };
        const metrics = { request: vi.fn(), overLimitGroups: vi.fn() };
        const coverage = vi.fn().mockResolvedValue(COVERAGE);
        const application = new FgcCoverageApplication(
            { coverage } as unknown as FgcCoverageService,
            { list: vi.fn().mockResolvedValue(MEMBERS) } as unknown as MemberDirectoryService,
            logs as unknown as FgcLogService,
            metrics as unknown as FgcMetricsService
        );

        const response = await application.get({ holder: ANA });

        expect(coverage).toHaveBeenCalledWith({ kind: 'person', userId: ANA });
        expect(response).toMatchObject({ scope: 'holder', peopleCount: 1, coveredMinor: 25_000_000 });
        expect(metrics.request).toHaveBeenCalledWith('coverage');
        expect(metrics.overLimitGroups).toHaveBeenCalledWith(1);
        expect(logs.computed).toHaveBeenCalledWith(2, 1, 0);
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
