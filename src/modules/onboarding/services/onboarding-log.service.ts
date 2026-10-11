import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';
import { MetricsService } from '../../../core/observability/metrics.service';
import { OnboardingCloseOutcome, OnboardingStep, OnboardingStepOutcome } from '../domain/onboarding.types';
import { OnboardingArea } from './onboarding-area-summary.port';

const LOG_IDENTIFIER: string = 'onboarding-wizard';
const STEP_METRIC: string = 'vera_onboarding_step_total';
const CLOSED_METRIC: string = 'vera_onboarding_closed_total';
const TIME_TO_CLOSE_METRIC: string = 'vera_onboarding_time_to_close_seconds';

@Injectable()
export class OnboardingLogService {
    public constructor(
        private readonly logService: LogService,
        private readonly metrics: MetricsService
    ) {}

    public started(): void {
        this.logService.info({ message: 'onboarding started', identifier: LOG_IDENTIFIER });
    }

    public stepSettled(step: OnboardingStep, outcome: OnboardingStepOutcome): void {
        this.logService.info({ message: 'onboarding step settled', identifier: LOG_IDENTIFIER, meta: { step, outcome } });
        this.metrics.count(STEP_METRIC, { step, outcome });
    }

    public closed(outcome: OnboardingCloseOutcome, secondsSinceCreation: number): void {
        const message: string = outcome === 'finished' ? 'onboarding finished' : 'onboarding dismissed';
        this.logService.info({ message, identifier: LOG_IDENTIFIER });
        this.metrics.count(CLOSED_METRIC, { outcome });
        this.metrics.observe(TIME_TO_CLOSE_METRIC, secondsSinceCreation);
    }

    public summaryAreaFailed(area: OnboardingArea, error: unknown): void {
        this.logService.warn({ message: 'onboarding summary area failed', identifier: LOG_IDENTIFIER, meta: { area }, error });
    }
}
