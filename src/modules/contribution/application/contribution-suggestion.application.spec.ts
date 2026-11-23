import { describe, expect, it, vi } from 'vitest';
import { snapshotOf } from '../../../../test/support/contribution-fixtures';
import { makePrototypeSource } from '../../../../test/support/portfolio-fixtures';
import { GoalsReaderService } from '../../goals/services/goals-reader.service';
import { PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { ContributionTargetsNotSetError } from '../domain/contribution.errors';
import { ContributionLogService } from '../services/contribution-log.service';
import { ContributionMetricsService } from '../services/contribution-metrics.service';
import { ContributionSuggestionApplication } from './contribution-suggestion.application';

function setup(zeroTargets: boolean = false, wishes: unknown[] = []) {
    const source = makePrototypeSource();
    const snapshot = snapshotOf(zeroTargets ? { ...source, classes: source.classes.map((item) => ({ ...item, targetBps: 0 })) } : source);
    const logs = { suggested: vi.fn(), targetsNotSet: vi.fn() };
    const metrics = { suggestion: vi.fn() };
    const application = new ContributionSuggestionApplication(
        { build: vi.fn().mockResolvedValue(snapshot) } as unknown as PortfolioSnapshotService,
        { priorities: vi.fn().mockResolvedValue(wishes) } as unknown as GoalsReaderService,
        logs as unknown as ContributionLogService,
        metrics as unknown as ContributionMetricsService
    );
    return { application, logs, metrics, snapshot };
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
            {} as GoalsReaderService,
            {} as ContributionLogService,
            {} as ContributionMetricsService
        );

        await expect(failing.suggest(1_000)).rejects.toThrow('boom');
    });

    it('sets apart the goal money first and splits the rest by class', async () => {
        const base = setup();
        const holding = base.snapshot.holdings.find((item) => !item.matured)!;
        const wish = {
            goalId: '11111111-1111-4111-8111-111111111111',
            kind: 'emergency_reserve',
            name: 'Reserva',
            targetDate: '2027-06-15',
            wantedMinor: 300_000,
            destination: { kind: holding.kind, holdingId: holding.id }
        };
        const { application } = setup(false, [wish]);

        const response = await application.suggest(1_000_000);

        expect(response.goalsAmountMinor).toBe(300_000);
        expect(response.goals).toHaveLength(1);
        expect(response.goals[0]?.destination.id).toBe(holding.id);
        expect(response.amountMinor).toBe(1_000_000);
        expect(response.totalBeforeMinor).toBe(base.snapshot.totalMinor);
        expect(response.totalAfterMinor).toBe(base.snapshot.totalMinor + 1_000_000);
        expect(response.classes.reduce((sum, item) => sum + item.amountMinor, 0)).toBe(700_000);
    });

    it('does not ask the goals when prioritizeGoals is false', async () => {
        const { application } = setup(false, [
            {
                goalId: 'x',
                kind: 'travel',
                name: 'n',
                targetDate: '2027-01-01',
                wantedMinor: 1,
                destination: { kind: 'position', holdingId: 'y' }
            }
        ]);

        const response = await application.suggest(1_000_000, false);

        expect(response.goals).toEqual([]);
        expect(response.goalsAmountMinor).toBe(0);
        expect(response.classes.reduce((sum, item) => sum + item.amountMinor, 0)).toBe(1_000_000);
    });

    it('gives everything to the goals when they ask for more than the contribution', async () => {
        const base = setup();
        const holding = base.snapshot.holdings.find((item) => !item.matured)!;
        const wish = {
            goalId: '11111111-1111-4111-8111-111111111111',
            kind: 'travel',
            name: 'Viagem',
            targetDate: '2027-06-15',
            wantedMinor: 5_000_000,
            destination: { kind: holding.kind, holdingId: holding.id }
        };
        const { application } = setup(false, [wish]);

        const response = await application.suggest(1_000_000);

        expect(response.goals[0]?.amountMinor).toBe(1_000_000);
        expect(response.classes).toEqual([]);
    });
});
