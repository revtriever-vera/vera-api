import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { UnmappedDimension } from '../domain/concentration.types';

const REQUESTS_TOTAL: string = 'vera_concentration_requests_total';
const UNMAPPED_RATIO: string = 'vera_concentration_unmapped_ratio';

@Injectable()
export class ConcentrationMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public requested(): void {
        this.metrics.count(REQUESTS_TOTAL);
    }

    public unmappedRatio(dimension: UnmappedDimension, ratio: number): void {
        this.metrics.observe(UNMAPPED_RATIO, ratio, { dimension });
    }
}
