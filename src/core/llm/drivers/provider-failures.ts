import { LlmProbeFailure } from '../llm.types';

const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([408, 429, 500, 502, 503, 504, 529]);
const UNAUTHORIZED_STATUSES: ReadonlySet<number> = new Set([401, 403]);
const TRANSIENT_NETWORK_CODES: ReadonlySet<string> = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);
const FETCH_FAILED_MESSAGE: string = 'fetch failed';
const TIMEOUT_DETAIL: string = 'timeout';
const NO_DETAIL: string = 'no detail';
const NOT_FOUND_STATUS: number = 404;
const STATUS_BY_ERROR_NAME: Readonly<Record<string, number>> = { GatewayAuthenticationError: 401 };
const BAD_REQUEST_STATUS: number = 400;

export class ProviderCallError extends Error {
    public constructor(
        public readonly status: number | null,
        public readonly detail: string,
        public readonly retryable: boolean
    ) {
        super(`provider answered ${status === null ? 'without status' : String(status)}: ${detail}`);
        this.name = 'ProviderCallError';
    }

    public get timedOut(): boolean {
        return this.detail === TIMEOUT_DETAIL;
    }

    public get refusedRequest(): boolean {
        return this.status === BAD_REQUEST_STATUS;
    }

    public get probeReason(): LlmProbeFailure {
        if (this.timedOut) {
            return 'timeout';
        }
        if (this.status !== null && UNAUTHORIZED_STATUSES.has(this.status)) {
            return 'unauthorized';
        }
        if (this.status === NOT_FOUND_STATUS) {
            return 'model_not_found';
        }
        return this.status === null && !this.retryable ? 'invalid_response' : 'unreachable';
    }

    public get logReason(): string {
        return this.timedOut ? 'timeout' : this.probeReason;
    }
}

function fieldOf(source: unknown, field: string): unknown {
    return typeof source === 'object' && source !== null ? (source as Readonly<Record<string, unknown>>)[field] : undefined;
}

function textFieldOf(source: unknown, field: string): string | null {
    const value: unknown = fieldOf(source, field);
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function statusOf(error: unknown): number | null {
    const status: unknown = fieldOf(error, 'statusCode') ?? fieldOf(fieldOf(error, 'cause'), 'statusCode');
    if (typeof status === 'number') {
        return status;
    }
    const name: string | null = textFieldOf(error, 'name');
    return name === null ? null : (STATUS_BY_ERROR_NAME[name] ?? null);
}

function isTransientNetworkError(error: unknown): boolean {
    const codes: unknown[] = [fieldOf(error, 'code'), fieldOf(fieldOf(error, 'cause'), 'code')];
    return (
        fieldOf(error, 'message') === FETCH_FAILED_MESSAGE ||
        codes.some((code: unknown): boolean => typeof code === 'string' && TRANSIENT_NETWORK_CODES.has(code))
    );
}

export function providerCallErrorOf(error: unknown, timedOut: boolean): ProviderCallError {
    if (error instanceof ProviderCallError) {
        return error;
    }
    if (timedOut) {
        return new ProviderCallError(null, TIMEOUT_DETAIL, true);
    }
    const status: number | null = statusOf(error);
    const detail: string = textFieldOf(error, 'type') ?? textFieldOf(error, 'name') ?? NO_DETAIL;
    if (status === null) {
        return new ProviderCallError(null, detail, isTransientNetworkError(error));
    }
    return new ProviderCallError(status, detail, RETRYABLE_STATUSES.has(status));
}

export function fieldValueOf(source: unknown, path: readonly string[]): unknown {
    return path.reduce((current: unknown, key: string): unknown => fieldOf(current, key), source);
}
