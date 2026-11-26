import { Injectable } from '@nestjs/common';
import { ZodTypeAny } from 'zod';
import { JsonObject } from '../../../core/llm/llm.types';
import { AppLocale } from '../../../shared/i18n/locale';
import { AskVeraToolOutput, AskVeraToolPort, PaidFeature } from '../../ai-assistant/services/ask-vera-tool.port';
import {
    ActionCandidate,
    ActionChoice,
    ActionOutcome,
    AssistantActionExecutorPort
} from '../../assistant-chat/services/assistant-action-executor.port';
import { TransactionCategorizeInput, transactionCategorizeInputSchema } from '../validation/transaction-proposal.schemas';
import { TransactionAssistantService, TransactionProposal } from './transaction-assistant.service';

export const TRANSACTION_CATEGORIZE_TOOL: string = 'transaction_categorize';

@Injectable()
export class TransactionCategorizeTool extends AskVeraToolPort {
    public readonly name: string = TRANSACTION_CATEGORIZE_TOOL;
    public readonly feature: PaidFeature = 'whatsapp';
    public readonly kind: AskVeraToolPort['kind'] = 'proposal';
    public readonly inputSchema: ZodTypeAny = transactionCategorizeInputSchema;

    public constructor(private readonly assistant: TransactionAssistantService) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'Propõe categorizar uma transação numa categoria (chave de list_categories); com always, também cria a regra "sempre para". A pessoa escolhe a transação no cartão e confirma: você não vê descrições de transações nem executa nada. Nunca diga que a transação foi categorizada.'
            : 'Proposes categorizing a transaction into a category (key from list_categories); with always, it also creates the "always for" rule. The person picks the transaction on the card and confirms: you see no transaction descriptions and run nothing. Never say the transaction was categorized.';
    }

    public async run(input: unknown): Promise<AskVeraToolOutput> {
        const proposal: TransactionProposal = await this.assistant.propose(input as TransactionCategorizeInput);
        if (proposal.status !== 'proposed') {
            return { payload: { status: proposal.status } };
        }
        return { payload: { status: 'proposed' }, proposal: { summary: proposal.summary, payload: proposal.payload } };
    }
}

@Injectable()
export class TransactionCategorizeExecutor extends AssistantActionExecutorPort {
    public readonly tool: string = TRANSACTION_CATEGORIZE_TOOL;

    public constructor(private readonly assistant: TransactionAssistantService) {
        super();
    }

    public async stateOf(payload: JsonObject): Promise<string> {
        return this.assistant.stateOf(payload);
    }

    public override candidates(payload: JsonObject): Promise<readonly ActionCandidate[]> {
        return this.assistant.candidates(payload);
    }

    public override alwaysOf(payload: JsonObject): boolean | null {
        return this.assistant.alwaysOf(payload);
    }

    public async execute(payload: JsonObject, choice: ActionChoice | null): Promise<ActionOutcome> {
        return { text: await this.assistant.categorize(payload, choice), reference: null };
    }
}
