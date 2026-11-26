import { Injectable } from '@nestjs/common';
import { ZodTypeAny } from 'zod';
import { JsonObject } from '../../../core/llm/llm.types';
import { AppLocale } from '../../../shared/i18n/locale';
import { AskVeraToolOutput, AskVeraToolPort, PaidFeature } from '../../ai-assistant/services/ask-vera-tool.port';
import { ActionOutcome, AssistantActionExecutorPort } from '../../assistant-chat/services/assistant-action-executor.port';
import { goalCreateInputSchema, GoalCreateInput } from '../validation/goal-proposal.schemas';
import { GoalAssistantService, GoalProposal } from './goal-assistant.service';

export const GOAL_CREATE_TOOL: string = 'goal_create';

@Injectable()
export class GoalCreateTool extends AskVeraToolPort {
    public readonly name: string = GOAL_CREATE_TOOL;
    public readonly feature: PaidFeature = 'whatsapp';
    public readonly kind: AskVeraToolPort['kind'] = 'proposal';
    public readonly inputSchema: ZodTypeAny = goalCreateInputSchema;

    public constructor(private readonly assistant: GoalAssistantService) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'Propõe criar um objetivo (nome, valor em centavos e mês alvo). Só propõe: a pessoa confirma no cartão, e quem cria é o sistema. Nunca diga que o objetivo foi criado.'
            : 'Proposes creating a goal (name, amount in cents and target month). It only proposes: the person confirms on the card and the system creates it. Never say the goal was created.';
    }

    public async run(input: unknown): Promise<AskVeraToolOutput> {
        const proposal: GoalProposal = await this.assistant.propose(input as GoalCreateInput);
        if (proposal.status === 'refused') {
            return { payload: { status: 'refused', reason: proposal.reason } };
        }
        return { payload: { status: 'proposed' }, proposal: { summary: proposal.summary, payload: proposal.payload } };
    }
}

@Injectable()
export class GoalCreateExecutor extends AssistantActionExecutorPort {
    public readonly tool: string = GOAL_CREATE_TOOL;

    public constructor(private readonly assistant: GoalAssistantService) {
        super();
    }

    public async stateOf(_payload: JsonObject): Promise<string> {
        return this.assistant.stateOf();
    }

    public async execute(payload: JsonObject): Promise<ActionOutcome> {
        return { text: await this.assistant.create(payload), reference: null };
    }
}
