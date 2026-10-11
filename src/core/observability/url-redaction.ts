const SECRET_PATH_SEGMENTS: readonly RegExp[] = [/^(\/webhooks\/[^/?]+\/)[^/?]+/];

const SECRET_QUERY_PARAMS: ReadonlySet<string> = new Set(['hub.verify_token']);

const SECRET_QUERY_PATTERN: RegExp = /([?&]hub\.verify_token=)[^&#]*/g;

const MASK: string = '<oculto>';

export interface SerializedRequest {
    readonly url: string;
    readonly query?: Record<string, unknown>;
    readonly params?: unknown;
}

export function redactUrl(url: string): string {
    const withoutPathSecrets: string = SECRET_PATH_SEGMENTS.reduce(
        (current: string, pattern: RegExp) => current.replace(pattern, `$1${MASK}`),
        url
    );
    return withoutPathSecrets.replace(SECRET_QUERY_PATTERN, `$1${MASK}`);
}

export function redactRequest(request: SerializedRequest): SerializedRequest {
    const { params: _params, query, ...rest }: SerializedRequest = request;
    return { ...rest, url: redactUrl(request.url), ...(query === undefined ? {} : { query: redactQuery(query) }) };
}

function redactQuery(query: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(query).map(([name, value]: [string, unknown]) => [name, SECRET_QUERY_PARAMS.has(name) ? MASK : value])
    );
}
