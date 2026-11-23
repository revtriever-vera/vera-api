import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { RequestResult } from '../domain/schedule.types';

const MATURITIES_TOTAL: string = 'vera_maturities_requests_total';
const REAL_RATES_TOTAL: string = 'vera_real_rates_requests_total';

@Injectable()
export class ScheduleMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public maturities(result: RequestResult): void {
        this.metrics.count(MATURITIES_TOTAL, { result });
    }

    public realRates(result: RequestResult): void {
        this.metrics.count(REAL_RATES_TOTAL, { result });
    }
}
