export type PluggyFailureReason = 'unreachable' | 'timeout' | 'rate_limited' | 'server_error' | 'format_invalid' | 'unexpected_status';

export class PluggyAuthRejectedError extends Error {
    public constructor() {
        super('pluggy_auth_rejected');
        this.name = 'PluggyAuthRejectedError';
    }
}

export class PluggyNotFoundError extends Error {
    public constructor() {
        super('pluggy_not_found');
        this.name = 'PluggyNotFoundError';
    }
}

export class PluggyUnavailableError extends Error {
    public readonly retryAfterSeconds: number | null;
    public readonly httpStatus: number | null;
    public readonly reason: PluggyFailureReason;

    public constructor(reason: PluggyFailureReason, httpStatus: number | null, retryAfterSeconds: number | null) {
        super('pluggy_unavailable');
        this.name = 'PluggyUnavailableError';
        this.reason = reason;
        this.httpStatus = httpStatus;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

export class PluggyOperationNotSupportedError extends Error {
    public constructor(operation: string) {
        super(`pluggy_operation_not_supported:${operation}`);
        this.name = 'PluggyOperationNotSupportedError';
    }
}
