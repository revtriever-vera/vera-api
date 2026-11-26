import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { JsonObject } from '../../../core/llm/llm.types';
import { ANY_HOLDER } from '../../../shared/holder/holder-filter';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { createdText, lastDayOfMonth, proposalSummary } from '../domain/goal-assistant-texts';
import { GoalDomain } from '../domain/goal.domain';
import { GoalLimitReachedError, GoalTargetDateInPastError } from '../domain/goals.errors';
import { Goal, GOAL_KINDS, GoalKind } from '../domain/goals.types';
import { GoalCreateInput, GoalProposalPayload, goalProposalPayloadSchema } from '../validation/goal-proposal.schemas';
import { GoalCreationService } from './goal-creation.service';
import { GoalRulesService } from './goal-rules.service';

export type GoalProposal =
    | { readonly status: 'proposed'; readonly summary: string; readonly payload: JsonObject }
    | { readonly status: 'refused'; readonly reason: 'limit_reached' | 'past_date' };

function kindOf(input: GoalCreateInput): GoalKind {
    return Object.values(GOAL_KINDS).find((kind: GoalKind): boolean => kind === input.kind) ?? GOAL_KINDS.other;
}

@Injectable()
export class GoalAssistantService {
    public constructor(
        private readonly goals: GoalDomain,
        private readonly rules: GoalRulesService,
        private readonly creation: GoalCreationService,
        private readonly timezones: CompanyTimezoneService,
        private readonly context: AppContext
    ) {}

    public async propose(input: GoalCreateInput): Promise<GoalProposal> {
        const targetDate: string = lastDayOfMonth(input.targetMonth);
        try {
            this.rules.assertFuture(targetDate, await this.timezones.todayInCompany());
            await this.rules.assertRoom();
        } catch (error: unknown) {
            if (error instanceof GoalTargetDateInPastError || error instanceof GoalLimitReachedError) {
                return { status: 'refused', reason: error instanceof GoalLimitReachedError ? 'limit_reached' : 'past_date' };
            }
            throw error;
        }
        const payload: GoalProposalPayload = { kind: kindOf(input), name: input.name, targetMinor: input.targetMinor, targetDate };
        return {
            status: 'proposed',
            summary: proposalSummary(input.name, input.targetMinor, targetDate, this.context.get().locale),
            payload
        };
    }

    public async stateOf(): Promise<string> {
        const goals: Goal[] = await this.goals.list(ANY_HOLDER);
        return goals
            .map((goal: Goal): string => goal.name.toLowerCase())
            .sort((left: string, right: string): number => left.localeCompare(right, 'en'))
            .join('|');
    }

    public async create(payload: JsonObject): Promise<string> {
        const parsed: GoalProposalPayload = goalProposalPayloadSchema.parse(payload);
        await this.creation.create({
            kind: parsed.kind,
            name: parsed.name,
            targetMinor: parsed.targetMinor,
            targetDate: parsed.targetDate,
            holdings: []
        });
        return createdText(parsed.name, parsed.targetMinor, parsed.targetDate, this.context.get().locale);
    }
}
