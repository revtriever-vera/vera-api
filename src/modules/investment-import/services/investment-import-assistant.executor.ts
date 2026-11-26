import { Injectable } from '@nestjs/common';
import { JsonObject } from '../../../core/llm/llm.types';
import { ActionChoice, ActionOutcome, AssistantActionExecutorPort } from '../../assistant-chat/services/assistant-action-executor.port';
import { INVESTMENT_IMPORT_TOOL, InvestmentImportAssistantService, ImportConfirmation } from './investment-import-assistant.service';

@Injectable()
export class InvestmentImportExecutor extends AssistantActionExecutorPort {
    public readonly tool: string = INVESTMENT_IMPORT_TOOL;

    public constructor(private readonly assistant: InvestmentImportAssistantService) {
        super();
    }

    public async stateOf(payload: JsonObject): Promise<string> {
        return this.assistant.stateOf(payload);
    }

    public override async preview(payload: JsonObject): Promise<JsonObject | null> {
        return this.assistant.view(payload);
    }

    public async execute(payload: JsonObject, choice: ActionChoice | null): Promise<ActionOutcome> {
        const confirmation: ImportConfirmation = await this.assistant.confirm(payload, choice);
        return { text: confirmation.text, reference: confirmation.importId };
    }
}
