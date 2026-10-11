import { PluggyAuthRejectedError, PluggyUnavailableError } from '../ports/pluggy-client.errors';

export function isRateLimited(error: unknown): error is PluggyUnavailableError {
    return error instanceof PluggyUnavailableError && error.reason === 'rate_limited';
}

export function isFatalSyncError(error: unknown): boolean {
    return error instanceof PluggyAuthRejectedError || isRateLimited(error);
}

export function errorNameOf(error: unknown): string {
    return error instanceof Error ? error.name : 'unknown';
}
