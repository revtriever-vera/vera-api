import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { LlmCallsHistoryService } from '../../../core/llm/services/llm-calls-history.service';
import { AccountDataEraserPort } from '../../identity/services/account-data-eraser.port';

export const LLM_CALLS_ERASE_AREA: string = 'llm-calls';

@Injectable()
export class LlmCallsAccountEraser extends AccountDataEraserPort {
    public readonly area: string = LLM_CALLS_ERASE_AREA;

    public constructor(private readonly history: LlmCallsHistoryService) {
        super();
    }

    @AsCompany()
    public async eraseAll(_companyId: string): Promise<number> {
        return this.history.eraseAll();
    }
}
