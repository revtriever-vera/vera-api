import { afterEach, describe, expect, it, vi } from 'vitest';
import { WhatsAppChannel } from '../domain/whatsapp.types';
import { WhatsAppGraphError } from '../ports/whatsapp-cloud.port';
import { CloudWhatsAppDriver } from './cloud-whatsapp.driver';

const CHANNEL: WhatsAppChannel = {
    phoneNumberId: 'phone-1',
    wabaId: 'waba-1',
    accessToken: 'token-for-spec',
    appSecret: 's',
    verifyToken: 'v',
    displayNumber: null,
    companyId: null
};

const CONFIG = {
    WHATSAPP_GRAPH_BASE_URL: 'https://graph.example.com',
    WHATSAPP_GRAPH_VERSION: 'v21.0',
    WHATSAPP_HTTP_TIMEOUT_MS: 1000
} as never;

function reply(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function stubFetch(...responses: Response[]): ReturnType<typeof vi.fn> {
    const fetchMock: ReturnType<typeof vi.fn> = vi.fn();
    for (const response of responses) {
        fetchMock.mockResolvedValueOnce(response);
    }
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

function lastCall(
    fetchMock: ReturnType<typeof vi.fn>,
    index: number = 0
): { url: string; init: RequestInit; body: Record<string, unknown> } {
    const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
    return { url, init, body: init.body === undefined ? {} : (JSON.parse(init.body as string) as Record<string, unknown>) };
}

describe('CloudWhatsAppDriver', () => {
    const driver: CloudWhatsAppDriver = new CloudWhatsAppDriver(CONFIG);

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('envia texto na versão fixada, com o token no cabeçalho e a resposta ao wamid', async () => {
        const fetchMock = stubFetch(reply(200, { messages: [{ id: 'wamid.1' }] }));

        const sent = await driver.sendText(CHANNEL, '5511999990000', 'oi', 'wamid.0');

        const call = lastCall(fetchMock);
        expect(sent).toEqual({ wamid: 'wamid.1' });
        expect(call.url).toBe('https://graph.example.com/v21.0/phone-1/messages');
        expect((call.init.headers as Record<string, string>)['authorization']).toBe('Bearer token-for-spec');
        expect(call.body).toMatchObject({
            messaging_product: 'whatsapp',
            to: '5511999990000',
            type: 'text',
            context: { message_id: 'wamid.0' }
        });
    });

    it('envia template com as variáveis e interativo com botões', async () => {
        const fetchMock = stubFetch(reply(200, { messages: [{ id: 'a' }] }), reply(200, { messages: [{ id: 'b' }] }));

        await driver.sendTemplate(CHANNEL, '1', { name: 'vera_lembrete', language: 'pt_BR', variables: ['pagar'] });
        await driver.sendInteractive(CHANNEL, '1', { body: 'x', choices: [{ id: 'rem:done:1', title: 'Feito' }] });

        expect(lastCall(fetchMock, 0).body['template']).toMatchObject({ name: 'vera_lembrete', language: { code: 'pt_BR' } });
        expect(lastCall(fetchMock, 1).body['interactive']).toMatchObject({ type: 'button' });
    });

    it('lista os templates paginando pelo cursor', async () => {
        const fetchMock = stubFetch(
            reply(200, {
                data: [{ id: '1', name: 'vera_lembrete', language: 'pt_BR', status: 'APPROVED' }],
                paging: { next: 'https://graph.example.com/next?after=abc' }
            }),
            reply(200, { data: [{ id: '2', name: 'vera_lembrete', language: 'en', status: 'ESTRANHO', rejected_reason: 'X' }] })
        );

        const templates = await driver.listTemplates(CHANNEL);

        expect(templates).toEqual([
            { name: 'vera_lembrete', language: 'pt_BR', status: 'APPROVED', remoteId: '1', rejectedReason: null },
            { name: 'vera_lembrete', language: 'en', status: 'PENDING', remoteId: '2', rejectedReason: 'X' }
        ]);
        expect(lastCall(fetchMock, 0).url).toContain('/waba-1/message_templates');
        expect(lastCall(fetchMock, 1).url).toContain('after=abc');
    });

    it('submete o template sem permitir a mudança de categoria', async () => {
        const fetchMock = stubFetch(reply(200, { id: 'remote-1' }));

        const result = await driver.submitTemplate(CHANNEL, {
            name: 'vera_lembrete',
            language: 'en',
            category: 'UTILITY',
            body: 'Hi {{1}}',
            examples: ['x']
        });

        expect(result).toEqual({ remoteId: 'remote-1' });
        expect(lastCall(fetchMock).body).toMatchObject({ category: 'UTILITY', allow_category_change: false });
    });

    it('lê a qualidade do número e trata a nota desconhecida', async () => {
        stubFetch(
            reply(200, { quality_rating: 'GREEN', messaging_limit_tier: 'TIER_1K', status: 'CONNECTED' }),
            reply(200, {}),
            reply(200, { quality_rating: 'NA' })
        );

        expect(await driver.phoneHealth(CHANNEL)).toEqual({ qualityRating: 'GREEN', messagingLimitTier: 'TIER_1K', status: 'CONNECTED' });
        expect(await driver.phoneHealth(CHANNEL)).toEqual({ qualityRating: 'UNKNOWN', messagingLimitTier: null, status: 'UNKNOWN' });
        expect((await driver.phoneHealth(CHANNEL)).qualityRating).toBe('UNKNOWN');
    });

    it('marca como lida', async () => {
        const fetchMock = stubFetch(reply(200, { success: true }));

        await driver.markRead(CHANNEL, 'wamid.9');

        expect(lastCall(fetchMock).body).toMatchObject({ status: 'read', message_id: 'wamid.9' });
    });

    it('traduz o erro da Graph, falha de rede e resposta fora do formato', async () => {
        stubFetch(reply(400, { error: { code: 131047 } }), reply(200, { unexpected: true }));
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValueOnce(reply(400, { error: { code: 131047 } }))
                .mockResolvedValueOnce(reply(200, { unexpected: true }))
                .mockRejectedValueOnce(new Error('down'))
        );

        const window: WhatsAppGraphError = (await driver
            .sendText(CHANNEL, '1', 'x')
            .catch((error: unknown) => error)) as WhatsAppGraphError;
        const format: WhatsAppGraphError = (await driver
            .sendText(CHANNEL, '1', 'x')
            .catch((error: unknown) => error)) as WhatsAppGraphError;
        const network: WhatsAppGraphError = (await driver
            .sendText(CHANNEL, '1', 'x')
            .catch((error: unknown) => error)) as WhatsAppGraphError;

        expect(window.kind).toBe('window_closed');
        expect(format.kind).toBe('transient');
        expect(network.kind).toBe('transient');
        expect(JSON.stringify([window.message, format.message, network.message])).not.toContain('token-for-spec');
    });

    it('lê o número de exibição pelo campo display_phone_number', async () => {
        const fetchMock = stubFetch(reply(200, { display_phone_number: '+55 11 4000-0000', id: 'phone-1' }), reply(200, { id: 'phone-1' }));

        expect(await driver.displayNumber(CHANNEL)).toBe('+55 11 4000-0000');
        expect(await driver.displayNumber(CHANNEL)).toBeNull();
        const call = lastCall(fetchMock);
        expect(call.url).toContain('/v21.0/phone-1?');
        expect(call.url).toContain('fields=display_phone_number');
    });
});
