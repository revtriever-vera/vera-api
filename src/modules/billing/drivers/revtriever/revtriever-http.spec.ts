import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BillingEngineRejectedError, BillingEngineUnavailableError } from '../../domain/billing-engine.errors';
import { RevtrieverHttp } from './revtriever-http';

const schema = z.object({ id: z.string() });

function respond(status: number, body: unknown = {}): Response {
    return new Response(JSON.stringify(body), { status });
}

function build(maxRetries: number = 2): { http: RevtrieverHttp; sleep: ReturnType<typeof vi.fn> } {
    const sleep: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const http: RevtrieverHttp = new RevtrieverHttp({
        baseUrl: 'https://rv.invalid',
        apiKey: 'rk_secret',
        timeoutMs: 500,
        maxRetries,
        sleep
    });
    return { http, sleep };
}

function stubFetch(...responses: Array<Response | Error>): ReturnType<typeof vi.fn> {
    const fetchMock: ReturnType<typeof vi.fn> = vi.fn();
    for (const next of responses) {
        fetchMock.mockImplementationOnce(() => (next instanceof Error ? Promise.reject(next) : Promise.resolve(next)));
    }
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (error: unknown) {
        return error;
    }
    return null;
}

describe('RevtrieverHttp', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('envia Bearer, Idempotency-Key e o corpo JSON no POST', async () => {
        const fetchMock = stubFetch(respond(200, { id: 'a' }));

        const result = await build().http.request({ method: 'POST', path: '/v1/x', body: { a: 1 }, idempotencyKey: 'k-1', schema });

        expect(result).toEqual({ id: 'a' });
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://rv.invalid/v1/x');
        expect(init.method).toBe('POST');
        expect(init.headers).toMatchObject({
            authorization: 'Bearer rk_secret',
            'idempotency-key': 'k-1',
            'content-type': 'application/json'
        });
        expect(JSON.parse(init.body as string)).toEqual({ a: 1 });
    });

    it('não manda corpo nem Idempotency-Key num GET', async () => {
        const fetchMock = stubFetch(respond(200, { id: 'a' }));

        await build().http.request({ method: 'GET', path: '/v1/x', schema });

        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(init.body).toBeUndefined();
        expect(init.headers).not.toHaveProperty('idempotency-key');
    });

    it.each([408, 429, 500, 503])('repete o %i com backoff exponencial e depois entrega', async (status: number) => {
        const fetchMock = stubFetch(respond(status), respond(status), respond(200, { id: 'ok' }));
        const { http, sleep } = build();

        expect(await http.request({ method: 'GET', path: '/v1/x', schema })).toEqual({ id: 'ok' });

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(sleep.mock.calls).toEqual([[200], [400]]);
    });

    it('esgotadas as tentativas, vira indisponível com o motivo', async () => {
        stubFetch(respond(429), respond(429), respond(429));

        const error = await failureOf(build().http.request({ method: 'GET', path: '/v1/x', schema }));

        expect(error).toBeInstanceOf(BillingEngineUnavailableError);
        expect(error).toMatchObject({ reason: 'rate_limited', httpStatus: 429, code: 'billing.provider_unavailable', status: 503 });
    });

    it('classifica 5xx esgotado como server_error', async () => {
        stubFetch(respond(502));

        const error = await failureOf(build(0).http.request({ method: 'GET', path: '/v1/x', schema }));

        expect(error).toMatchObject({ reason: 'server_error', httpStatus: 502 });
    });

    it('não repete 4xx e devolve a rejeição com o problemType sem colocá-lo na resposta', async () => {
        const fetchMock = stubFetch(respond(422, { type: 'engine.plan_not_found', detail: 'segredo do corpo' }));

        const error = await failureOf(build().http.request({ method: 'GET', path: '/v1/x', schema }));

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(error).toBeInstanceOf(BillingEngineRejectedError);
        const rejected = error as BillingEngineRejectedError;
        expect(rejected).toMatchObject({
            problemType: 'engine.plan_not_found',
            httpStatus: 422,
            code: 'billing.engine_rejected',
            status: 502
        });
        expect(JSON.stringify([rejected.meta, rejected.detail])).not.toContain('engine.plan_not_found');
        expect(JSON.stringify([rejected.meta, rejected.detail])).not.toContain('segredo');
    });

    it('4xx sem problem+json legível ainda é rejeição, com problemType nulo', async () => {
        stubFetch(new Response('texto solto', { status: 400 }));

        const error = await failureOf(build().http.request({ method: 'GET', path: '/v1/x', schema }));

        expect(error).toMatchObject({ problemType: null, httpStatus: 400 });
    });

    it('idempotência em andamento não é rejeição: o chamador tenta de novo', async () => {
        stubFetch(respond(409, { type: 'engine.idempotency_in_progress' }));

        const error = await failureOf(build().http.request({ method: 'POST', path: '/v1/x', body: {}, schema }));

        expect(error).toBeInstanceOf(BillingEngineUnavailableError);
        expect(error).toMatchObject({ reason: 'idempotency_in_progress', httpStatus: 409 });
    });

    it('status fora de 4xx e 5xx é indisponível', async () => {
        stubFetch(respond(302));

        expect(await failureOf(build().http.request({ method: 'GET', path: '/v1/x', schema }))).toMatchObject({
            reason: 'unexpected_status'
        });
    });

    it('resposta fora do schema vira format_invalid sem vazar o corpo', async () => {
        stubFetch(respond(200, { id: 42, segredo: 'valor-sensivel' }));

        const error = await failureOf(build().http.request({ method: 'GET', path: '/v1/x', schema }));

        expect(error).toMatchObject({ reason: 'format_invalid' });
        expect(JSON.stringify(error)).not.toContain('valor-sensivel');
        expect((error as Error).message).not.toContain('valor-sensivel');
    });

    it('corpo que não é JSON vira format_invalid', async () => {
        stubFetch(new Response('<html>', { status: 200 }));

        expect(await failureOf(build().http.request({ method: 'GET', path: '/v1/x', schema }))).toMatchObject({ reason: 'format_invalid' });
    });

    it('timeout e rede fora do ar viram indisponível sem repetir', async () => {
        const timeout: Error = Object.assign(new Error('t'), { name: 'TimeoutError' });
        const fetchMock = stubFetch(timeout, new Error('boom'));
        const { http } = build();

        expect(await failureOf(http.request({ method: 'GET', path: '/v1/x', schema }))).toMatchObject({ reason: 'timeout' });
        expect(await failureOf(http.request({ method: 'GET', path: '/v1/x', schema }))).toMatchObject({ reason: 'unreachable' });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('usa o sleep real quando não recebe um', async () => {
        vi.useFakeTimers();
        stubFetch(respond(503), respond(200, { id: 'ok' }));
        const http: RevtrieverHttp = new RevtrieverHttp({ baseUrl: 'https://rv.invalid', apiKey: 'k', timeoutMs: 500, maxRetries: 1 });

        const pending = http.request({ method: 'GET', path: '/v1/x', schema });
        await vi.advanceTimersByTimeAsync(200);

        expect(await pending).toEqual({ id: 'ok' });
        vi.useRealTimers();
    });
});
