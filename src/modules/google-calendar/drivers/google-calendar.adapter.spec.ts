import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseGoogleCalendarConfig } from '../config/google-calendar.config';
import { CalendarProviderUnavailableError, CalendarReadOnlyError, CalendarTokenRevokedError } from '../domain/calendar.errors';
import { CalendarSession, SCOPE_READ_WRITE } from '../domain/calendar.types';
import { GoogleCalendarAdapter } from './google-calendar.adapter';
import { GoogleOAuthHttp } from './google-oauth-http';

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
const CONFIG = parseGoogleCalendarConfig({ GOOGLE_CALENDAR_DRIVER: 'google', GOOGLE_CALENDAR_TIMEOUT_MS: '500' });
const SESSION: CalendarSession = {
    refreshToken: 'refresh-1',
    scopes: [SCOPE_READ_WRITE],
    credentials: { clientId: 'client', clientSecret: 'secret', redirectUri: 'https://api.test/cb' }
};
const NEW_EVENT = {
    summary: 'Revisão',
    start: new Date('2026-11-27T18:00:00.000Z'),
    end: new Date('2026-11-27T19:00:00.000Z'),
    timeZone: 'America/Sao_Paulo',
    source: 'vera' as const,
    idempotencyKey: 'vera0123456789abcdefghijklmnopqrstu'
};

function bodyOf(call: number): string {
    return (fetchMock.mock.calls[call]?.[1]?.body as string | undefined) ?? '';
}

function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('GoogleCalendarAdapter', () => {
    const adapter: GoogleCalendarAdapter = new GoogleCalendarAdapter(new GoogleOAuthHttp(CONFIG), CONFIG);

    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function answers(...responses: Response[]): void {
        responses.forEach((response: Response) => fetchMock.mockResolvedValueOnce(response));
    }

    it('lista eventos, marca os da Vera e entende o dia inteiro', async () => {
        answers(
            json(200, { access_token: 'at' }),
            json(200, {
                items: [
                    {
                        id: 'a',
                        summary: 'Revisão',
                        start: { dateTime: '2026-11-24T10:00:00-03:00' },
                        end: { dateTime: '2026-11-24T11:00:00-03:00' },
                        extendedProperties: { private: { source: 'vera' } }
                    },
                    { id: 'b', summary: 'Feriado', start: { date: '2026-11-25' }, end: { date: '2026-11-26' } },
                    { id: 'c', status: 'cancelled', start: { date: '2026-11-25' }, end: { date: '2026-11-26' } }
                ]
            })
        );

        const events = await adapter.listUpcoming(SESSION, {
            from: new Date('2026-11-23T00:00:00Z'),
            to: new Date('2026-11-30T00:00:00Z'),
            max: 10
        });

        expect(events).toEqual([
            { id: 'a', title: 'Revisão', start: '2026-11-24T13:00:00.000Z', end: '2026-11-24T14:00:00.000Z', allDay: false, byVera: true },
            { id: 'b', title: 'Feriado', start: '2026-11-25T00:00:00.000Z', end: '2026-11-26T00:00:00.000Z', allDay: true, byVera: false }
        ]);
        const listUrl: string = fetchMock.mock.calls[1]?.[0] ?? '';
        expect(listUrl).toContain('calendars/primary/events');
        expect(listUrl).toContain('singleEvents=true');
        expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('authorization')).toBe('Bearer at');
    });

    it('cria o evento com o id da proposta e a marca da Vera', async () => {
        answers(json(200, { access_token: 'at' }), json(200, { id: NEW_EVENT.idempotencyKey }));

        const created = await adapter.createEvent(SESSION, NEW_EVENT);

        expect(created).toEqual({ eventId: NEW_EVENT.idempotencyKey, duplicate: false });
        const body = JSON.parse(bodyOf(1)) as Record<string, unknown>;
        expect(body).toMatchObject({ id: NEW_EVENT.idempotencyKey, extendedProperties: { private: { source: 'vera' } } });
    });

    it('trata o conflito do mesmo id como evento já criado', async () => {
        answers(json(200, { access_token: 'at' }), json(409, { error: { code: 409 } }));

        await expect(adapter.createEvent(SESSION, NEW_EVENT)).resolves.toEqual({ eventId: NEW_EVENT.idempotencyKey, duplicate: true });
    });

    it('devolve só leitura quando o Google nega a escrita', async () => {
        answers(json(200, { access_token: 'at' }), json(403, { error: { code: 403 } }));

        await expect(adapter.createEvent(SESSION, NEW_EVENT)).rejects.toBeInstanceOf(CalendarReadOnlyError);
    });

    it('mapeia invalid_grant na renovação do token para permissão revogada', async () => {
        answers(json(400, { error: 'invalid_grant' }));

        await expect(adapter.listUpcoming(SESSION, { from: new Date(), to: new Date(), max: 1 })).rejects.toBeInstanceOf(
            CalendarTokenRevokedError
        );
    });

    it('mapeia 401 da API e falha de rede', async () => {
        answers(json(200, { access_token: 'at' }), json(401, {}));
        await expect(adapter.listUpcoming(SESSION, { from: new Date(), to: new Date(), max: 1 })).rejects.toBeInstanceOf(
            CalendarTokenRevokedError
        );

        fetchMock.mockRejectedValueOnce(new Error('timeout'));
        await expect(adapter.listUpcoming(SESSION, { from: new Date(), to: new Date(), max: 1 })).rejects.toBeInstanceOf(
            CalendarProviderUnavailableError
        );
    });

    it('troca o código com o verifier e o secret, e lê os escopos concedidos', async () => {
        answers(json(200, { refresh_token: 'rt', scope: `openid ${SCOPE_READ_WRITE}` }));

        const grant = await adapter.exchangeCode({ credentials: SESSION.credentials, code: 'code-1', codeVerifier: 'verifier-1' });

        expect(grant).toEqual({ refreshToken: 'rt', scopes: ['openid', SCOPE_READ_WRITE], email: null });
        const form = new URLSearchParams(bodyOf(0));
        expect(Object.fromEntries(form)).toMatchObject({
            grant_type: 'authorization_code',
            code: 'code-1',
            code_verifier: 'verifier-1',
            client_secret: 'secret'
        });
    });

    it('revoga o token no endpoint do Google', async () => {
        answers(new Response(null, { status: 200 }));

        await adapter.revoke(SESSION);

        expect(fetchMock.mock.calls[0]?.[0]).toBe('https://oauth2.googleapis.com/revoke');
        expect(bodyOf(0)).toBe('token=refresh-1');
    });

    it('só leitura vem dos escopos concedidos', () => {
        expect(adapter.accessOf(SESSION)).toBe('read_write');
        expect(adapter.accessOf({ ...SESSION, scopes: ['https://www.googleapis.com/auth/calendar.events.readonly'] })).toBe('read_only');
    });
});
