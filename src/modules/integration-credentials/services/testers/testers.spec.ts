import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntegrationTestFailedError } from '../../domain/integration-credentials.errors';
import { parseIntegrationCredentialsConfig } from '../../config/integration-credentials.config';
import { LlmTester } from './llm.tester';
import { WhatsAppTester } from './whatsapp.tester';

const config = parseIntegrationCredentialsConfig({});
const LLM = {
    kind: 'llm',
    baseUrl: 'https://llm.example.com/v1',
    apiKey: 'key-12345678',
    model: 'model-a',
    provider: 'openai_compatible'
} as const;
const WHATSAPP = {
    kind: 'whatsapp',
    accessToken: 'token-12345678',
    phoneNumberId: '1048576',
    verifyToken: 'v',
    appSecret: 's',
    wabaId: null
} as const;

function reply(status: number, body: unknown = {}): Response {
    return new Response(JSON.stringify(body), { status });
}

async function reasonOf(promise: Promise<void>): Promise<string | null> {
    try {
        await promise;
        return null;
    } catch (error: unknown) {
        return error instanceof IntegrationTestFailedError ? error.reason : 'other';
    }
}

describe('LlmTester', () => {
    afterEach(() => vi.unstubAllGlobals());
    const tester: LlmTester = new LlmTester(config);

    it('passa quando o modelo está na listagem e recusa quando não está', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation(() => Promise.resolve(reply(200, { data: [{ id: 'model-a' }] })))
        );
        expect(await reasonOf(tester.test(LLM))).toBeNull();
        expect(await reasonOf(tester.test({ ...LLM, model: 'model-z' }))).toBe('invalid_model');
    });

    it.each([
        [401, 'unauthorized'],
        [500, 'unreachable']
    ])('traduz %i da listagem em %s', async (status: number, reason: string) => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation(() => Promise.resolve(reply(status)))
        );

        expect(await reasonOf(tester.test(LLM))).toBe(reason);
    });

    it('cai para uma chamada de 1 token quando não há /models', async () => {
        const fetcher = vi.fn().mockResolvedValueOnce(reply(404)).mockResolvedValueOnce(reply(200));
        vi.stubGlobal('fetch', fetcher);

        expect(await reasonOf(tester.test(LLM))).toBeNull();
        expect(String(fetcher.mock.calls[1]?.[0])).toBe('https://llm.example.com/v1/chat/completions');
        expect((JSON.parse((fetcher.mock.calls[1]?.[1] as { body: string }).body) as { max_tokens: number }).max_tokens).toBe(1);
    });

    it('trata a listagem fora do formato como ausente e o modelo inexistente do chat como invalid_model', async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(reply(200, { nope: true }))
            .mockResolvedValueOnce(reply(404));
        vi.stubGlobal('fetch', fetcher);

        expect(await reasonOf(tester.test(LLM))).toBe('invalid_model');
    });

    it('traduz rede e tempo esgotado em unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

        expect(await reasonOf(tester.test(LLM))).toBe('unreachable');
    });

    it('não segue redirecionamento', async () => {
        const fetcher = vi.fn().mockResolvedValue(reply(200, { data: [{ id: 'model-a' }] }));
        vi.stubGlobal('fetch', fetcher);

        await tester.test(LLM);

        expect((fetcher.mock.calls[0]?.[1] as RequestInit).redirect).toBe('manual');
    });
});

describe('WhatsAppTester', () => {
    afterEach(() => vi.unstubAllGlobals());
    const tester: WhatsAppTester = new WhatsAppTester(config);

    it.each([
        [200, null],
        [401, 'unauthorized'],
        [404, 'not_found'],
        [503, 'unreachable']
    ])('responde %i com %s', async (status: number, reason: string | null) => {
        const fetcher = vi.fn().mockResolvedValue(reply(status));
        vi.stubGlobal('fetch', fetcher);

        expect(await reasonOf(tester.test(WHATSAPP))).toBe(reason);
        expect(String(fetcher.mock.calls[0]?.[0])).toContain('/1048576?fields=display_phone_number,verified_name');
    });
});
