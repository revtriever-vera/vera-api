import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogService } from '../../observability/log.service';
import { LlmDriverCall } from './llm-driver';
import { OpenAiCompatibleLlmDriver } from './openai-compatible-llm.driver';
import { ProviderCallError } from './provider-failures';

interface Seen {
    readonly authorization: string | undefined;
    readonly path: string | undefined;
    readonly body: Record<string, unknown>;
}

type Reply = { readonly status: number; readonly body: unknown };

const OK_BODY: Reply = {
    status: 200,
    body: {
        id: 'x',
        object: 'chat.completion',
        created: 1,
        model: 'local-model',
        choices: [{ index: 0, message: { role: 'assistant', content: '{"a":1}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 }
    }
};

describe('OpenAiCompatibleLlmDriver', () => {
    const logService = { warn: vi.fn(), error: vi.fn() };
    const seen: Seen[] = [];
    let replies: Reply[] = [];
    let server: Server;
    let baseUrl: string;
    let driver: OpenAiCompatibleLlmDriver;

    beforeAll(async () => {
        server = createServer((request: IncomingMessage, response: ServerResponse) => {
            const chunks: Buffer[] = [];
            request.on('data', (chunk: Buffer) => chunks.push(chunk));
            request.on('end', () => {
                seen.push({
                    authorization: request.headers.authorization,
                    path: request.url,
                    body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
                });
                const reply: Reply = replies.shift() ?? OK_BODY;
                if (reply.status === 302) {
                    response.writeHead(302, { location: '/elsewhere' }).end();
                    return;
                }
                response.writeHead(reply.status, { 'content-type': 'application/json' }).end(JSON.stringify(reply.body));
            });
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/v1`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve) =>
            server.close(() => {
                resolve();
            })
        );
    });

    beforeEach(() => {
        seen.length = 0;
        replies = [];
        logService.warn.mockReset();
        logService.error.mockReset();
        driver = new OpenAiCompatibleLlmDriver(logService as unknown as LogService);
    });

    function call(maxRetries: number = 0, request: Partial<LlmDriverCall['request']> = {}, url: string = baseUrl): LlmDriverCall {
        return {
            credentials: { driver: 'openai_compatible', baseUrl: url, apiKey: 'account-key', modelId: 'local-model' },
            spec: {
                task: 'summary_month',
                maxOutputTokens: 50,
                maxCostMicros: 1,
                temperature: 0.1,
                reasoning: 'provider-default',
                timeoutMs: 5000,
                maxRetries,
                evalThreshold: 0.8,
                promptVersion: 'v1'
            },
            request: { task: 'summary_month', system: 'sys', messages: [{ role: 'user', content: 'oi' }], ...request }
        };
    }

    it('usa a baseURL, a chave e o modelo das credenciais e mapeia o uso', async () => {
        const result = await driver.generate(call());

        expect(seen[0]?.path).toBe('/v1/chat/completions');
        expect(seen[0]?.authorization).toBe('Bearer account-key');
        expect(seen[0]?.body['model']).toBe('local-model');
        expect(result).toMatchObject({
            text: '{"a":1}',
            usage: { inputTokens: 12, outputTokens: 4 },
            stopReason: 'end',
            servedModelId: null
        });
    });

    it('com responseSchema tenta response_format e, se o provedor recusar com 400, repete uma vez em modo texto pedindo JSON', async () => {
        replies = [{ status: 400, body: { error: { message: 'response_format is not supported' } } }];
        const schema = { type: 'object', properties: { a: { type: 'number' } } };

        const result = await driver.generate(call(0, { responseSchema: schema }));

        expect(seen).toHaveLength(2);
        expect(seen[0]?.body['response_format']).toBeDefined();
        expect(seen[1]?.body['response_format']).toBeUndefined();
        expect(JSON.stringify(seen[1]?.body['messages'])).toContain('JSON Schema');
        expect(result.text).toBe('{"a":1}');
        expect(logService.warn).toHaveBeenCalledWith(expect.objectContaining({ identifier: 'llm-openai-compatible' }));
    });

    it('400 sem responseSchema não repete em modo texto', async () => {
        replies = [{ status: 400, body: { error: { message: 'bad' } } }];

        await expect(driver.generate(call())).rejects.toMatchObject({ code: 'ai.provider_unavailable' });
        expect(seen).toHaveLength(1);
    });

    it('401 vira ai.provider_unavailable com motivo unauthorized no log', async () => {
        replies = [{ status: 401, body: { error: { message: 'no' } } }];

        await expect(driver.generate(call())).rejects.toMatchObject({ code: 'ai.provider_unavailable', meta: { reason: 'unauthorized' } });
        expect(logService.error).toHaveBeenCalledWith(expect.objectContaining({ identifier: 'llm-openai-compatible' }));
    });

    it('repete em 503 e conclui na segunda tentativa', async () => {
        replies = [{ status: 503, body: { error: { message: 'busy' } } }];

        const result = await driver.generate(call(1));

        expect(result.attempts).toBe(2);
        expect(seen).toHaveLength(2);
    });

    it('não segue redirecionamento', async () => {
        replies = [{ status: 302, body: null }];

        await expect(driver.generate(call())).rejects.toMatchObject({ code: 'ai.provider_unavailable' });
        expect(seen).toHaveLength(1);
    });

    it('só o host entra no log, nunca a URL inteira nem a chave', async () => {
        replies = [{ status: 401, body: {} }];

        await expect(driver.generate(call())).rejects.toBeDefined();

        const logged: string = JSON.stringify([logService.warn.mock.calls, logService.error.mock.calls]);
        expect(logged).toContain('127.0.0.1:');
        expect(logged).not.toContain('/v1');
        expect(logged).not.toContain('account-key');
    });

    it('rejeita credenciais de outro tipo e URL inválida vira host nulo', async () => {
        const wrong: LlmDriverCall = { ...call(), credentials: { driver: 'gateway', apiKey: 'k', modelId: 'm' } };

        await expect(driver.generate(wrong)).rejects.toBeInstanceOf(ProviderCallError);
        await expect(driver.generate(call(0, {}, 'not a url'))).rejects.toBeDefined();
        expect(logService.error).toHaveBeenLastCalledWith(expect.objectContaining({ meta: expect.objectContaining({ host: null }) }));
    });
});
