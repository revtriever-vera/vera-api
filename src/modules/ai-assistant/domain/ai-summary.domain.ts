import { Injectable } from '@nestjs/common';
import { AiSummariesRepository } from '../repositories/ai-summaries.repository';
import { AiSummary, SaveSummaryInput, SummaryKind } from './summary.types';

@Injectable()
export class AiSummaryDomain {
    public constructor(private readonly summaries: AiSummariesRepository) {}

    public async findStored(kind: SummaryKind, periodKey: string, locale: string): Promise<AiSummary | null> {
        return this.summaries.findStored(kind, periodKey, locale);
    }

    public async save(input: SaveSummaryInput): Promise<AiSummary> {
        return this.summaries.save(input);
    }

    public async listAll(): Promise<AiSummary[]> {
        return this.summaries.listAll();
    }

    public async eraseAll(): Promise<number> {
        return this.summaries.eraseAll();
    }

    public async purgeBefore(cutoff: Date): Promise<number> {
        return this.summaries.purgeBefore(cutoff);
    }
}
