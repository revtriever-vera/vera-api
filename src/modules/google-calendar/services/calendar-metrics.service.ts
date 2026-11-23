import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';

const CONNECTIONS_TOTAL: string = 'vera_calendar_connections_total';
const EVENTS_CREATED_TOTAL: string = 'vera_calendar_events_created_total';
const API_TOTAL: string = 'vera_calendar_api_total';

@Injectable()
export class CalendarMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public connection(status: string): void {
        this.metrics.count(CONNECTIONS_TOTAL, { status });
    }

    public eventCreated(): void {
        this.metrics.count(EVENTS_CREATED_TOTAL);
    }

    public api(operation: string, outcome: string): void {
        this.metrics.count(API_TOTAL, { operation, outcome });
    }
}
