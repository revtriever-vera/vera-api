import { GraphFailureKind, WhatsAppGraphError } from '../ports/whatsapp-cloud.port';

const HTTP_UNAUTHORIZED: number = 401;
const HTTP_TOO_MANY_REQUESTS: number = 429;
const HTTP_SERVER_ERROR: number = 500;
const UNKNOWN_CODE: string = 'unknown';

const KIND_BY_CODE: ReadonlyMap<number, GraphFailureKind> = new Map<number, GraphFailureKind>([
    [190, 'token_invalid'],
    [102, 'token_invalid'],
    [130429, 'rate_limited'],
    [131056, 'rate_limited'],
    [80007, 'rate_limited'],
    [4, 'rate_limited'],
    [17, 'rate_limited'],
    [131026, 'recipient_invalid'],
    [131021, 'recipient_invalid'],
    [131030, 'recipient_invalid'],
    [131047, 'window_closed'],
    [131051, 'window_closed']
]);

function codeOf(body: unknown): number | null {
    const code: unknown = (body as { error?: { code?: unknown } } | null)?.error?.code;
    return typeof code === 'number' ? code : null;
}

function kindOfStatus(status: number | null): GraphFailureKind {
    if (status === HTTP_UNAUTHORIZED) {
        return 'token_invalid';
    }
    if (status === HTTP_TOO_MANY_REQUESTS) {
        return 'rate_limited';
    }
    return status === null || status >= HTTP_SERVER_ERROR ? 'transient' : 'rejected';
}

export function graphErrorOf(status: number | null, body: unknown): WhatsAppGraphError {
    const code: number | null = codeOf(body);
    const kind: GraphFailureKind = (code === null ? undefined : KIND_BY_CODE.get(code)) ?? kindOfStatus(status);
    return new WhatsAppGraphError(kind, code === null ? UNKNOWN_CODE : String(code), status);
}

export function isRetryable(error: WhatsAppGraphError): boolean {
    return error.kind === 'rate_limited' || error.kind === 'transient';
}
