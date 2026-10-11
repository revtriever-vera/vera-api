import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { CutStatus } from '../domain/spending-cuts.types';

const CUTS_TOTAL: string = 'vera_spending_cuts_total';

@Injectable()
export class SpendingCutsMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public cuts(status: CutStatus): void {
        this.metrics.count(CUTS_TOTAL, { status });
    }
}
