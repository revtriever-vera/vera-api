import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { ValuationStatus } from '../domain/curve/curve.types';

const SYNC_TOTAL: string = 'vera_fixed_income_index_sync_total';
const INDEX_AGE: string = 'vera_fixed_income_index_age_days';
const VALUATION_TOTAL: string = 'vera_fixed_income_valuation_total';

@Injectable()
export class FixedIncomeMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public sync(series: string, result: 'success' | 'failure'): void {
        this.metrics.count(SYNC_TOTAL, { series, result });
    }

    public indexAge(series: string, days: number): void {
        this.metrics.gauge(INDEX_AGE, days, { series });
    }

    public valuation(status: ValuationStatus, amount: number): void {
        this.metrics.count(VALUATION_TOTAL, { status }, amount);
    }
}
