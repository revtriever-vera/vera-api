import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateText } from 'ai';
import { LogService } from '../../observability/log.service';
import { LlmProviderUnavailableError } from '../llm.errors';
import { GatewayLlmDriver, pinnedProviderOf } from './gateway-llm.driver';
import { LlmDriverCall } from './llm-driver';

vi.mock('ai', async (importOriginal: () => Promise<Record<string, unknown>>) => ({
    ...(await importOriginal()),
    generateText: vi.fn(),
    createGateway: vi.fn(() => (modelId: string) => ({ modelId }))
}));

const generate = vi.mocked(generateText);

function call(overrides: Partial<LlmDriverCall['spec']> = {}, request: Partial<LlmDriverCall['request']> = {}): LlmDriverCall {
    return {
        credentials: { driver: 'gateway', apiKey: 'secret-key', modelId: 'meta/muse-spark-1.3-contributor' },
        spec: {
            task: 'summary_month',
            model: 'primary',
            maxOutputTokens: 100,
            maxCostMicros: 1,
            temperature: 0.2,
            reasoning: 'provider-default',
            timeoutMs: 1000,
            maxRetries: 2,
            evalThreshold: 0.8,
            promptVersion: 'v1',
            ...overrides
        },
        request: { task: 'summary_month', system: 'sys', messages: [{ role: 'user', content: 'oi' }], ...request }
    };
}

function answer(extra: Record<string, unknown> = {}): never {
    return {
        text: ' resposta ',
        toolCalls: [],
        finishReason: 'stop',
        usage: {
            inputTokens: 120,
            outputTokens: 30,
            inputTokenDetails: { noCacheTokens: 100, cacheReadTokens: 20 },
            outputTokenDetails: {}
        },
        finalStep: { providerMetadata: { gateway: { routing: { canonicalSlug: 'meta/muse-spark-1.3-contributor' }, cost: '0.002' } } },
        ...extra
    } as never;
}

function failure(statusCode: number): Error {
    return Object.assign(new Error('http'), { statusCode, name: 'AI_APICallError' });
}

describe('GatewayLlmDriver', () => {
    const logService = { warn: vi.fn(), error: vi.fn() };
    let driver: GatewayLlmDriver;

    beforeEach(() => {
        vi.useFakeTimers();
        generate.mockReset();
        logService.warn.mockReset();
        logService.error.mockReset();
        driver = new GatewayLlmDriver(logService as unknown as LogService);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('pina o provedor dono do modelo, sem retries do SDK, e mapeia texto, uso e custo', async () => {
        generate.mockResolvedValueOnce(answer());

        const result = await driver.generate(call());

        const options = generate.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
        expect(options['providerOptions']).toEqual({ gateway: { only: ['meta'] } });
        expect(options['maxRetries']).toBe(0);
        expect(options['maxOutputTokens']).toBe(100);
        expect(options['temperature']).toBe(0.2);
        expect(options['system']).toBe('sys');
        expect(result).toMatchObject({
            text: 'resposta',
            stopReason: 'end',
            usage: { inputTokens: 100, outputTokens: 30, cacheReadTokens: 20 },
            servedModelId: 'meta/muse-spark-1.3-contributor',
            providerCostUsd: 0.002,
            attempts: 1
        });
        expect(logService.warn).not.toHaveBeenCalled();
    });

    it('devolve o motivo de parada e o raciocínio da chamada, sem o conteúdo', async () => {
        generate.mockResolvedValueOnce(
            answer({
                text: '',
                finishReason: 'length',
                rawFinishReason: 'max_tokens',
                finalStep: { reasoningText: 'pensando' },
                usage: { inputTokens: 1, outputTokens: 9, inputTokenDetails: {}, outputTokenDetails: { reasoningTokens: 7 } }
            })
        );

        const result = await driver.generate(call());

        expect(result.diagnostic).toEqual({ finishReason: 'max_tokens', reasoningTokens: 7, reasoningChars: 8 });
    });

    it('repassa o nível de raciocínio do catálogo ao SDK', async () => {
        generate.mockResolvedValueOnce(answer());

        await driver.generate(call({ reasoning: 'minimal' }));

        const options = generate.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
        expect(options['reasoning']).toBe('minimal');
    });

    it('descobre o pino do modelo pelo prefixo', () => {
        expect(pinnedProviderOf('openai/gpt-x')).toBe('openai');
        expect(pinnedProviderOf('solo')).toBe('solo');
    });

    it('com responseSchema pede saída estruturada, e com ferramentas as repassa e devolve toolUses', async () => {
        generate.mockResolvedValueOnce(
            answer({ text: '', finishReason: 'tool-calls', toolCalls: [{ toolCallId: 't1', toolName: 'lookup', input: { q: 1 } }] })
        );

        const result = await driver.generate(
            call(
                {},
                {
                    responseSchema: { type: 'object', properties: {} },
                    tools: [{ name: 'lookup', description: 'd', inputSchema: { type: 'object', properties: {} } }]
                }
            )
        );

        const options = generate.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
        expect(options['output']).toBeDefined();
        expect(Object.keys(options['tools'] as object)).toEqual(['lookup']);
        expect(result.stopReason).toBe('tool_use');
        expect(result.toolUses).toEqual([{ toolUseId: 't1', name: 'lookup', input: { q: 1 } }]);
    });

    it('trata entrada de ferramenta ausente como null e corte por tamanho como max_tokens', async () => {
        generate.mockResolvedValueOnce(
            answer({ finishReason: 'length', toolCalls: [{ toolCallId: 't', toolName: 'n', input: undefined }] })
        );
        generate.mockResolvedValueOnce(answer({ finishReason: 'length' }));

        expect((await driver.generate(call())).toolUses[0]?.input).toBeNull();
        expect((await driver.generate(call())).stopReason).toBe('max_tokens');
    });

    it('repete em 429 e 5xx com recuo 500 ms x 2^n e para de repetir ao conseguir', async () => {
        generate.mockRejectedValueOnce(failure(429)).mockRejectedValueOnce(failure(503)).mockResolvedValueOnce(answer());

        const pending = driver.generate(call());
        await vi.advanceTimersByTimeAsync(500);
        expect(generate).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1000);
        const result = await pending;

        expect(generate).toHaveBeenCalledTimes(3);
        expect(result.attempts).toBe(3);
        expect(logService.warn).toHaveBeenCalledTimes(2);
    });

    it('desiste depois de maxRetries e fala ai.provider_unavailable com o número de tentativas', async () => {
        generate.mockRejectedValue(failure(500));

        const pending = driver.generate(call());
        const assertion = expect(pending).rejects.toMatchObject({ code: 'ai.provider_unavailable', status: 503, attempts: 3 });
        await vi.advanceTimersByTimeAsync(1500);
        await assertion;

        expect(generate).toHaveBeenCalledTimes(3);
        expect(logService.error).toHaveBeenCalledWith(
            expect.objectContaining({ identifier: 'llm-gateway', meta: expect.objectContaining({ attempts: 3, status: 500 }) })
        );
    });

    it('não repete em 400', async () => {
        generate.mockRejectedValue(failure(400));

        await expect(driver.generate(call())).rejects.toBeInstanceOf(LlmProviderUnavailableError);

        expect(generate).toHaveBeenCalledTimes(1);
    });

    it('estourar o tempo vira ai.provider_unavailable com motivo timeout', async () => {
        vi.useRealTimers();
        generate.mockImplementation(
            (options: { abortSignal?: AbortSignal }) =>
                new Promise((_resolve, reject) => {
                    options.abortSignal?.addEventListener('abort', () => {
                        reject(new Error('aborted'));
                    });
                })
        );

        await expect(driver.generate(call({ timeoutMs: 20, maxRetries: 0 }))).rejects.toMatchObject({
            code: 'ai.provider_unavailable',
            meta: { reason: 'timeout', attempts: 1 }
        });
    });

    it('modelo servido diferente do pinado loga warn e devolve o slug', async () => {
        generate.mockResolvedValueOnce(
            answer({ finalStep: { providerMetadata: { gateway: { routing: { canonicalSlug: 'meta/outro' } } } } })
        );

        const result = await driver.generate(call());

        expect(result.servedModelId).toBe('meta/outro');
        expect(result.providerCostUsd).toBeNull();
        expect(logService.warn).toHaveBeenCalledWith(
            expect.objectContaining({ identifier: 'llm-gateway', meta: expect.objectContaining({ servedModelId: 'meta/outro' }) })
        );
    });

    it('sem metadados do gateway não há modelo servido nem custo, e custo numérico também vale', async () => {
        generate.mockResolvedValueOnce(answer({ finalStep: { providerMetadata: undefined } }));
        generate.mockResolvedValueOnce(answer({ finalStep: { providerMetadata: { gateway: { cost: 0.5 } } } }));

        const first = await driver.generate(call());
        const second = await driver.generate(call());

        expect(first.servedModelId).toBeNull();
        expect(first.providerCostUsd).toBeNull();
        expect(second.providerCostUsd).toBe(0.5);
    });

    it('nunca loga a chave nem o prompt', async () => {
        generate.mockRejectedValue(failure(400));

        await expect(driver.generate(call({}, { system: 'SEGREDO-DO-PROMPT' }))).rejects.toBeDefined();

        const logged: string = JSON.stringify([logService.warn.mock.calls, logService.error.mock.calls]);
        expect(logged).not.toContain('secret-key');
        expect(logged).not.toContain('SEGREDO-DO-PROMPT');
    });
});
