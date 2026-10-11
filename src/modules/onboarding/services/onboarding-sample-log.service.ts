import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';
import { MetricsService } from '../../../core/observability/metrics.service';
import { SampleAreaResult } from './sample-data.port';

const LOG_IDENTIFIER: string = 'onboarding-sample';
const SAMPLE_METRIC: string = 'vera_onboarding_sample_total';

export type SampleAction = 'seed' | 'clear';
export type SampleOutcome = 'success' | 'unavailable' | 'failed';

@Injectable()
export class OnboardingSampleLogService {
    public constructor(
        private readonly logService: LogService,
        private readonly metrics: MetricsService
    ) {}

    public loaded(results: readonly SampleAreaResult[]): void {
        this.logService.info({
            message: 'sample data loaded',
            identifier: LOG_IDENTIFIER,
            meta: { areas: results.map((result: SampleAreaResult) => ({ area: result.area, seeded: result.count })) }
        });
    }

    public cleared(results: readonly SampleAreaResult[]): void {
        this.logService.info({
            message: 'sample data cleared',
            identifier: LOG_IDENTIFIER,
            meta: { areas: results.map((result: SampleAreaResult) => ({ area: result.area, cleared: result.count })) }
        });
    }

    public areaFailed(area: string, error: unknown): void {
        this.logService.error({ message: 'sample data area failed', identifier: LOG_IDENTIFIER, meta: { area }, error });
    }

    public outcome(action: SampleAction, outcome: SampleOutcome): void {
        this.metrics.count(SAMPLE_METRIC, { action, outcome });
    }
}
