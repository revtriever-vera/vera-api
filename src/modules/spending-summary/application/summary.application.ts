import { Injectable } from '@nestjs/common';
import { MonthlySummary } from '../domain/spending-summary.types';
import { SpendingSummaryService } from '../services/spending-summary.service';

@Injectable()
export class SummaryApplication {
    public constructor(private readonly summary: SpendingSummaryService) {}

    public async get(month: string | undefined): Promise<MonthlySummary> {
        return this.summary.build(month ?? null);
    }
}
