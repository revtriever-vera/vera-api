import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { GateOutcome, PaidFeature } from '../domain/plans.types';

const GATE_TOTAL: string = 'vera_plans_gate_total';

@Injectable()
export class PlansMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public gate(feature: PaidFeature, outcome: GateOutcome): void {
        this.metrics.count(GATE_TOTAL, { feature, outcome });
    }
}
