import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { PositionAction } from '../domain/positions.types';

const POSITIONS_TOTAL: string = 'vera_positions_total';

@Injectable()
export class PositionsMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public action(action: PositionAction): void {
        this.metrics.count(POSITIONS_TOTAL, { action });
    }
}
