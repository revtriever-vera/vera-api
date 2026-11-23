import { AppError } from '../../shared/errors/app.error';

export class LlmProviderDisabledError extends AppError {
    public constructor() {
        super({ code: 'ai.provider_disabled', status: 503, detail: 'No language model credentials are configured for this company.' });
    }
}

export class LlmProviderUnavailableError extends AppError {
    public constructor(
        public readonly reason: string,
        public readonly attempts: number,
        cause?: unknown
    ) {
        super({
            code: 'ai.provider_unavailable',
            status: 503,
            detail: 'The language model provider did not answer after the retries.',
            meta: { reason, attempts },
            cause
        });
    }
}

export class LlmInvalidResponseError extends AppError {
    public constructor(task: string) {
        super({
            code: 'ai.invalid_response',
            status: 502,
            detail: 'The language model answered with content the task cannot use.',
            meta: { task }
        });
    }
}

export class LlmRepeatedRequestError extends AppError {
    public constructor(task: string, answered: number) {
        super({
            code: 'ai.repeated_request',
            status: 429,
            detail: 'The same request was already answered too many times in the last 24 hours.',
            meta: { task, answered }
        });
    }
}

export class LlmUnknownTaskError extends AppError {
    public constructor(task: string) {
        super({ code: 'ai.unknown_task', status: 500, detail: 'The task is not in the language model catalog.', meta: { task } });
    }
}
