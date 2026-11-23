import { describe, expect, it, vi } from 'vitest';
import { ContributionTargetsNotSetError } from '../domain/contribution.errors';
import { ContributionPlannerService } from './contribution-planner.service';

const buildSuggestion = vi.fn();

vi.mock('../domain/suggestion-builder', () => ({ buildSuggestion: (...args: unknown[]): unknown => buildSuggestion(...args) }));

describe('ContributionPlannerService', () => {
    it('devolve a sugestão quando há metas', () => {
        buildSuggestion.mockReturnValueOnce({ amountMinor: 100 });

        expect(new ContributionPlannerService().planOrNull({} as never, 100)).toEqual({ amountMinor: 100 });
    });

    it('devolve nulo quando as metas de classe não estão definidas', () => {
        buildSuggestion.mockImplementationOnce(() => {
            throw new ContributionTargetsNotSetError();
        });

        expect(new ContributionPlannerService().planOrNull({} as never, 100)).toBeNull();
    });

    it('propaga qualquer outro erro', () => {
        buildSuggestion.mockImplementationOnce(() => {
            throw new Error('boom');
        });

        expect(() => new ContributionPlannerService().planOrNull({} as never, 100)).toThrow('boom');
    });
});
