import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';

const SUMMARY_DURATION: string = 'vera_spending_summary_duration_seconds';
const MS_PER_SECOND: number = 1000;

@Injectable()
export class SpendingSummaryMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public summaryDuration(durationMs: number): void {
        this.metrics.observe(SUMMARY_DURATION, durationMs / MS_PER_SECOND);
    }
}
