import { AppError } from '../../../shared/errors/app.error';
import { FAILURE_REASONS, FAILURE_STAGES, FailureReason, FailureStage } from './market-data.types';

export class ExchangeRateUnavailableError extends AppError {
    public constructor(currency: string) {
        super({
            code: 'market-data.exchange_rate_unavailable',
            status: 404,
            detail: 'No exchange rate is available for the currency.',
            meta: { currency }
        });
    }
}

export class ProviderError extends Error {
    public readonly stage: FailureStage;
    public readonly reason: FailureReason;

    public constructor(stage: FailureStage, reason: FailureReason) {
        super(reason);
        this.name = 'ProviderError';
        this.stage = stage;
        this.reason = reason;
    }

    public static unreachable(): ProviderError {
        return new ProviderError(FAILURE_STAGES.request, FAILURE_REASONS.unreachable);
    }

    public static formatInvalid(): ProviderError {
        return new ProviderError(FAILURE_STAGES.parse, FAILURE_REASONS.formatInvalid);
    }

    public static ofStatus(status: number): ProviderError {
        if (status === 429) {
            return new ProviderError(FAILURE_STAGES.request, FAILURE_REASONS.rateLimited);
        }
        if (status === 404) {
            return new ProviderError(FAILURE_STAGES.notFound, FAILURE_REASONS.symbolUnknown);
        }
        return new ProviderError(FAILURE_STAGES.request, status >= 500 ? FAILURE_REASONS.unavailable : FAILURE_REASONS.rejected);
    }
}
