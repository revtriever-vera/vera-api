import { SafeParseReturnType, ZodType } from 'zod';
import { graphErrorOf } from '../domain/graph-error.mapper';

export type GraphRequest = {
    readonly method: 'GET' | 'POST';
    readonly path: string;
    readonly accessToken: string;
    readonly body?: unknown;
    readonly query?: Readonly<Record<string, string>>;
};

async function readJson(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

export class GraphHttp {
    public constructor(
        private readonly baseUrl: string,
        private readonly version: string,
        private readonly timeoutMs: number
    ) {}

    public async request<T>(request: GraphRequest, schema: ZodType<T>): Promise<T> {
        const response: Response = await this.execute(request);
        const body: unknown = await readJson(response);
        if (!response.ok) {
            throw graphErrorOf(response.status, body);
        }
        const parsed: SafeParseReturnType<unknown, T> = schema.safeParse(body);
        if (!parsed.success) {
            throw graphErrorOf(null, null);
        }
        return parsed.data;
    }

    private async execute(request: GraphRequest): Promise<Response> {
        try {
            return await fetch(this.urlOf(request), {
                method: request.method,
                headers: {
                    accept: 'application/json',
                    authorization: `Bearer ${request.accessToken}`,
                    ...(request.body === undefined ? {} : { 'content-type': 'application/json' })
                },
                body: request.body === undefined ? undefined : JSON.stringify(request.body),
                redirect: 'manual',
                signal: AbortSignal.timeout(this.timeoutMs)
            });
        } catch {
            throw graphErrorOf(null, null);
        }
    }

    private urlOf(request: GraphRequest): string {
        const query: string = new URLSearchParams(request.query ?? {}).toString();
        const base: string = `${this.baseUrl}/${this.version}/${request.path.replace(/^\//, '')}`;
        return query === '' ? base : `${base}?${query}`;
    }
}
