import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';

const ACTIVE: string = 'vera_reminders_active';
const FIRED_TOTAL: string = 'vera_reminders_fired_total';
const MISSED_TOTAL: string = 'vera_reminders_missed_total';

@Injectable()
export class RemindersMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public active(total: number): void {
        this.metrics.gauge(ACTIVE, total);
    }

    public fired(channel: string): void {
        this.metrics.count(FIRED_TOTAL, { channel });
    }

    public missed(reason: string): void {
        this.metrics.count(MISSED_TOTAL, { reason });
    }
}
