import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { AccountDataEraserPort } from '../../identity/services/account-data-eraser.port';
import { AiSummaryDomain } from '../domain/ai-summary.domain';

export const AI_SUMMARIES_ERASE_AREA: string = 'ai_summaries';

@Injectable()
export class AiSummariesEraser extends AccountDataEraserPort {
    public readonly area: string = AI_SUMMARIES_ERASE_AREA;

    public constructor(private readonly summaries: AiSummaryDomain) {
        super();
    }

    @AsCompany()
    public async eraseAll(_companyId: string): Promise<number> {
        return this.summaries.eraseAll();
    }
}
