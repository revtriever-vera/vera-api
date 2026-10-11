import { PluggyAuthRejectedError, PluggyNotFoundError, PluggyUnavailableError } from '../ports/pluggy-client.errors';
import { PluggyCredentialsPair } from './pluggy-session';

export type PluggyRequestKind = 'auth' | 'read';

const DEFAULT_RETRY_AFTER_SECONDS: number = 60;
const HTTP_UNAUTHORIZED: number = 401;
const HTTP_FORBIDDEN: number = 403;
const HTTP_NOT_FOUND: number = 404;
const HTTP_BAD_REQUEST: number = 400;
const HTTP_TOO_MANY_REQUESTS: number = 429;
const HTTP_SERVER_ERROR: number = 500;
const AUTH_REJECTING_STATUSES: readonly number[] = [HTTP_BAD_REQUEST, HTTP_UNAUTHORIZED, HTTP_FORBIDDEN];

function retryAfterOf(response: Response): number | null {
    const seconds: number = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
    return Number.isInteger(seconds) && seconds > 0 ? seconds : null;
}

function authFailureOf(status: number): Error | null {
    return AUTH_REJECTING_STATUSES.includes(status) ? new PluggyAuthRejectedError() : null;
}

function readFailureOf(status: number): Error | null {
    if (status === HTTP_UNAUTHORIZED) {
        return new PluggyAuthRejectedError();
    }
    return status === HTTP_NOT_FOUND || status === HTTP_FORBIDDEN ? new PluggyNotFoundError() : null;
}

function failureOf(response: Response, kind: PluggyRequestKind): Error {
    const status: number = response.status;
    const classified: Error | null = kind === 'auth' ? authFailureOf(status) : readFailureOf(status);
    if (classified !== null) {
        return classified;
    }
    if (status === HTTP_TOO_MANY_REQUESTS) {
        return new PluggyUnavailableError('rate_limited', status, retryAfterOf(response) ?? DEFAULT_RETRY_AFTER_SECONDS);
    }
    if (status >= HTTP_SERVER_ERROR) {
        return new PluggyUnavailableError('server_error', status, retryAfterOf(response));
    }
    return new PluggyUnavailableError('unexpected_status', status, null);
}

async function execute(url: string, init: RequestInit, kind: PluggyRequestKind, timeoutMs: number): Promise<unknown> {
    let response: Response;
    try {
        response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error: unknown) {
        const timedOut: boolean = error instanceof Error && error.name === 'TimeoutError';
        throw new PluggyUnavailableError(timedOut ? 'timeout' : 'unreachable', null, null);
    }
    if (!response.ok) {
        await response.body?.cancel();
        throw failureOf(response, kind);
    }
    try {
        return await response.json();
    } catch {
        throw new PluggyUnavailableError('format_invalid', response.status, null);
    }
}

export class PluggyHttp {
    public constructor(
        private readonly baseUrl: string,
        private readonly authPath: string,
        private readonly timeoutMs: number
    ) {}

    public async postAuth(credentials: PluggyCredentialsPair): Promise<unknown> {
        return execute(
            `${this.baseUrl}${this.authPath}`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json', accept: 'application/json' },
                body: JSON.stringify(credentials)
            },
            'auth',
            this.timeoutMs
        );
    }

    public async get(path: string, apiKey: string): Promise<unknown> {
        return execute(
            `${this.baseUrl}${path}`,
            { method: 'GET', headers: { accept: 'application/json', 'X-API-KEY': apiKey } },
            'read',
            this.timeoutMs
        );
    }
}
