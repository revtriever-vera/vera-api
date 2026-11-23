import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { IntegrationKind, TestFailureReason } from '../domain/integration.types';

const TESTS_TOTAL: string = 'vera_integrations_tests_total';
const CONFIGURED_GAUGE: string = 'vera_integrations_configured';

export type TestOutcome = 'ok' | TestFailureReason;

@Injectable()
export class IntegrationsMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public tested(kind: IntegrationKind, outcome: TestOutcome): void {
        this.metrics.count(TESTS_TOTAL, { kind, outcome });
    }

    public configured(kind: IntegrationKind, total: number): void {
        this.metrics.gauge(CONFIGURED_GAUGE, total, { kind });
    }
}
