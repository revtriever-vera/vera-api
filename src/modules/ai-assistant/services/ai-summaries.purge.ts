import { Injectable } from '@nestjs/common';
import { AiSummaryDomain } from '../domain/ai-summary.domain';
import { AiDataPurgePort } from './ai-data-purge.port';

export const AI_SUMMARIES_PURGE_AREA: string = 'ai_summaries';

@Injectable()
export class AiSummariesPurge extends AiDataPurgePort {
    public readonly area: string = AI_SUMMARIES_PURGE_AREA;

    public constructor(private readonly summaries: AiSummaryDomain) {
        super();
    }

    public async purge(): Promise<number> {
        return this.summaries.eraseAll();
    }
}
