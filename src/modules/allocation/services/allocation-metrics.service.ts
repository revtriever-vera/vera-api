import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { ClassAction } from '../domain/allocation.types';

const CLASS_ACTIONS_TOTAL: string = 'vera_allocation_class_actions_total';

@Injectable()
export class AllocationMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public classAction(action: ClassAction, amount: number = 1): void {
        this.metrics.count(CLASS_ACTIONS_TOTAL, { action }, amount);
    }
}
