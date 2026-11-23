const SECRET_PATH_SEGMENTS: readonly RegExp[] = [
    /^(\/webhooks\/[^/?]+\/)[^/?]+/,
    /^(\/invites\/)[^/?]+/,
    /^(\/notifications\/unsubscribe\/)[^/?]+/,
    /^(\/billing\/_dev\/capture\/)[^/?]+/,
    /(\/tokens?\/)[^/?]+/
];

const SECRET_QUERY_PARAMS: ReadonlySet<string> = new Set(['hub.verify_token']);

const OAUTH_CALLBACK_PATH: RegExp = /^\/calendar\/google\/callback(?=[?#]|$)/;

const OAUTH_CALLBACK_PARAMS: ReadonlySet<string> = new Set(['code', 'state']);

const SECRET_QUERY_PATTERN: RegExp = /([?&]hub\.verify_token=)[^&#]*/g;

const OAUTH_QUERY_PATTERN: RegExp = /([?&](?:code|state)=)[^&#]*/g;

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
    const withoutQuerySecrets: string = withoutPathSecrets.replace(SECRET_QUERY_PATTERN, `$1${MASK}`);
    return OAUTH_CALLBACK_PATH.test(withoutQuerySecrets)
        ? withoutQuerySecrets.replace(OAUTH_QUERY_PATTERN, `$1${MASK}`)
        : withoutQuerySecrets;
}

export function redactRequest(request: SerializedRequest): SerializedRequest {
    const { params: _params, query, ...rest }: SerializedRequest = request;
    const secretNames: ReadonlySet<string> = OAUTH_CALLBACK_PATH.test(request.url)
        ? new Set([...SECRET_QUERY_PARAMS, ...OAUTH_CALLBACK_PARAMS])
        : SECRET_QUERY_PARAMS;
    return { ...rest, url: redactUrl(request.url), ...(query === undefined ? {} : { query: redactQuery(query, secretNames) }) };
}

function redactQuery(query: Record<string, unknown>, secretNames: ReadonlySet<string>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(query).map(([name, value]: [string, unknown]) => [name, secretNames.has(name) ? MASK : value])
    );
}
