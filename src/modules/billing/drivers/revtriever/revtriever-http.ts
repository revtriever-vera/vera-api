import { z } from 'zod';
import { BillingEngineRejectedError, BillingEngineUnavailableError, EngineFailureReason } from '../../domain/billing-engine.errors';
import { IDEMPOTENCY_IN_PROGRESS, problemTypeOf } from './revtriever-problem';

const HTTP_BAD_REQUEST: number = 400;
const HTTP_REQUEST_TIMEOUT: number = 408;
const HTTP_TOO_MANY_REQUESTS: number = 429;
const HTTP_SERVER_ERROR: number = 500;
const BACKOFF_BASE_MS: number = 200;

export interface RevtrieverHttpOptions {
    readonly baseUrl: string;
    readonly apiKey: string;
    readonly timeoutMs: number;
    readonly maxRetries: number;
    readonly sleep?: (ms: number) => Promise<void>;
}

export interface RevtrieverRequest<T> {
    readonly method: 'GET' | 'POST' | 'PUT';
    readonly path: string;
    readonly schema: z.ZodType<T, z.ZodTypeDef, unknown>;
    readonly body?: unknown;
    readonly idempotencyKey?: string;
}

function defaultSleep(ms: number): Promise<void> {
    return new Promise((resolve: () => void): void => {
        setTimeout(resolve, ms);
    });
}

function isRetryable(status: number): boolean {
    return status === HTTP_REQUEST_TIMEOUT || status === HTTP_TOO_MANY_REQUESTS || status >= HTTP_SERVER_ERROR;
}

function unavailableReasonOf(status: number): EngineFailureReason {
    if (status === HTTP_TOO_MANY_REQUESTS) {
        return 'rate_limited';
    }
    return status >= HTTP_SERVER_ERROR ? 'server_error' : 'unexpected_status';
}

export class RevtrieverHttp {
    private readonly sleep: (ms: number) => Promise<void>;

    public constructor(private readonly options: RevtrieverHttpOptions) {
        this.sleep = options.sleep ?? defaultSleep;
    }

    public async request<T>(request: RevtrieverRequest<T>): Promise<T> {
        let attempt: number = 0;
        for (;;) {
            const response: Response = await this.send(request);
            if (response.ok) {
                return this.parse(request.schema, response);
            }
            if (isRetryable(response.status) && attempt < this.options.maxRetries) {
                await response.body?.cancel();
                await this.sleep(BACKOFF_BASE_MS * 2 ** attempt);
                attempt += 1;
                continue;
            }
            throw await this.failureOf(response);
        }
    }

    private headersOf<T>(request: RevtrieverRequest<T>): Record<string, string> {
        const headers: Record<string, string> = {
            accept: 'application/json',
            authorization: `Bearer ${this.options.apiKey}`
        };
        if (request.body !== undefined) {
            headers['content-type'] = 'application/json';
        }
        if (request.idempotencyKey !== undefined) {
            headers['idempotency-key'] = request.idempotencyKey;
        }
        return headers;
    }

    private async send<T>(request: RevtrieverRequest<T>): Promise<Response> {
        try {
            return await fetch(`${this.options.baseUrl}${request.path}`, {
                method: request.method,
                headers: this.headersOf(request),
                body: request.body === undefined ? undefined : JSON.stringify(request.body),
                signal: AbortSignal.timeout(this.options.timeoutMs)
            });
        } catch (error: unknown) {
            const timedOut: boolean = error instanceof Error && error.name === 'TimeoutError';
            throw new BillingEngineUnavailableError(timedOut ? 'timeout' : 'unreachable', null);
        }
    }

    private async parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, response: Response): Promise<T> {
        let body: unknown;
        try {
            body = await response.json();
        } catch {
            throw new BillingEngineUnavailableError('format_invalid', response.status);
        }
        const result: z.SafeParseReturnType<unknown, T> = schema.safeParse(body);
        if (!result.success) {
            throw new BillingEngineUnavailableError('format_invalid', response.status);
        }
        return result.data;
    }

    private async failureOf(response: Response): Promise<Error> {
        const status: number = response.status;
        const problemType: string | null = await problemTypeOf(response);
        if (problemType === IDEMPOTENCY_IN_PROGRESS) {
            return new BillingEngineUnavailableError('idempotency_in_progress', status);
        }
        if (isRetryable(status)) {
            return new BillingEngineUnavailableError(unavailableReasonOf(status), status);
        }
        return status >= HTTP_BAD_REQUEST && status < HTTP_SERVER_ERROR
            ? new BillingEngineRejectedError(status, problemType)
            : new BillingEngineUnavailableError('unexpected_status', status);
    }
}
