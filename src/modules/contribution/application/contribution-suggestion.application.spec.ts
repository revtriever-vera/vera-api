import { describe, expect, it, vi } from 'vitest';
import { snapshotOf } from '../../../../test/support/contribution-fixtures';
import { makePrototypeSource } from '../../../../test/support/portfolio-fixtures';
import { PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { ContributionTargetsNotSetError } from '../domain/contribution.errors';
import { ContributionLogService } from '../services/contribution-log.service';
import { ContributionMetricsService } from '../services/contribution-metrics.service';
import { ContributionSuggestionApplication } from './contribution-suggestion.application';

function setup(zeroTargets: boolean = false) {
    const source = makePrototypeSource();
    const snapshot = snapshotOf(zeroTargets ? { ...source, classes: source.classes.map((item) => ({ ...item, targetBps: 0 })) } : source);
    const logs = { suggested: vi.fn(), targetsNotSet: vi.fn() };
    const metrics = { suggestion: vi.fn() };
    const application = new ContributionSuggestionApplication(
        { build: vi.fn().mockResolvedValue(snapshot) } as unknown as PortfolioSnapshotService,
        logs as unknown as ContributionLogService,
        metrics as unknown as ContributionMetricsService
    );
    return { application, logs, metrics };
}

describe('ContributionSuggestionApplication', () => {
    it('suggests, counts the success and logs only counters', async () => {
        const { application, logs, metrics } = setup();

        const response = await application.suggest(1_000_000);

        expect(response.classes.reduce((sum, item) => sum + item.amountMinor, 0)).toBe(1_000_000);
        expect(metrics.suggestion).toHaveBeenCalledExactlyOnceWith('ok');
        const fields = logs.suggested.mock.calls[0]?.[0] as Record<string, number>;
        expect(Object.keys(fields).toSorted()).toEqual(['assetsFunded', 'classesFunded', 'warnings']);
        expect(fields['classesFunded']).toBe(response.classes.length);
    });

    it('counts and logs the refusal when the targets are not set', async () => {
        const { application, logs, metrics } = setup(true);

        await expect(application.suggest(1_000)).rejects.toBeInstanceOf(ContributionTargetsNotSetError);

        expect(metrics.suggestion).toHaveBeenCalledExactlyOnceWith('targets_not_set');
        expect(logs.targetsNotSet).toHaveBeenCalledOnce();
        expect(logs.suggested).not.toHaveBeenCalled();
    });

    it('rethrows an unexpected error without counting it as a refusal', async () => {
        const failing = new ContributionSuggestionApplication(
            { build: vi.fn().mockRejectedValue(new Error('boom')) } as unknown as PortfolioSnapshotService,
            {} as ContributionLogService,
            {} as ContributionMetricsService
        );

        await expect(failing.suggest(1_000)).rejects.toThrow('boom');
    });
});
