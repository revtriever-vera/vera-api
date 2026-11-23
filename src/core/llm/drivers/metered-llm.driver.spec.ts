import { describe, expect, it, vi } from 'vitest';
import { CapReachedError } from '../../usage/usage.errors';
import { LlmConfig } from '../config/llm.config';
import { LlmProviderUnavailableError } from '../llm.errors';
import { LlmGenerationRequest, LlmCredentials } from '../llm.types';
import { LlmLedgerService } from '../services/llm-ledger.service';
import { LlmPricingService } from '../services/llm-pricing.service';
import { LlmTaskRegistryService } from '../services/llm-task-registry.service';
import { LlmDriverResult } from './llm-driver';
import { LlmDriverRouter } from './llm-driver-router';
import { MeteredLlmDriver } from './metered-llm.driver';

const GATEWAY: LlmCredentials = { driver: 'gateway', apiKey: 'k', modelId: 'vendor/model-a' };
const SELF_HOSTED: LlmCredentials = { driver: 'openai_compatible', baseUrl: 'http://h/v1', apiKey: 'k', modelId: 'local' };

const RESULT: LlmDriverResult = {
    text: 'resumo pronto',
    toolUses: [],
    stopReason: 'end',
    usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0 },
    servedModelId: 'vendor/served',
    providerCostUsd: 0.001,
    attempts: 2,
    latencyMs: 80
};

const REQUEST: LlmGenerationRequest = {
    task: 'summary_month',
    feature: 'ai',
    system: 'sys',
    messages: [{ role: 'user', content: 'MARCADOR-DO-PROMPT' }],
    referenceId: 'ref-1'
};

function build(options: { mode?: 'live' | 'mock'; credentials?: LlmCredentials | null; repeats?: number } = {}) {
    const config: Partial<LlmConfig> = { LLM_DRIVER: options.mode ?? 'live', LLM_MODEL_ID: 'vendor/model-a', LLM_REPEAT_LIMIT: 3 };
    const driver = { generate: vi.fn().mockResolvedValue(RESULT) };
    const router = { driverFor: vi.fn().mockReturnValue(driver) };
    const ledger = {
        assertRoom: vi.fn().mockResolvedValue(undefined),
        answeredSince: vi.fn().mockResolvedValue(options.repeats ?? 0),
        record: vi.fn().mockResolvedValue(undefined)
    };
    const pricing = {
        costMicros: vi.fn().mockResolvedValue(1234),
        usdToMicros: vi.fn().mockResolvedValue(1100)
    };
    const credentials = { resolve: vi.fn().mockResolvedValue(options.credentials === undefined ? GATEWAY : options.credentials) };
    const metered: MeteredLlmDriver = new MeteredLlmDriver(
        config as LlmConfig,
        new LlmTaskRegistryService(),
        credentials,
        pricing as unknown as LlmPricingService,
        router as unknown as LlmDriverRouter,
        ledger as unknown as LlmLedgerService
    );
    return { metered, driver, router, ledger, pricing, credentials };
}

describe('MeteredLlmDriver', () => {
    it('sem credencial lança ai.provider_disabled sem checar a cota nem chamar o driver', async () => {
        const { metered, ledger, driver } = build({ credentials: null });

        await expect(metered.generate(REQUEST)).rejects.toMatchObject({ code: 'ai.provider_disabled', status: 503 });

        expect(ledger.assertRoom).not.toHaveBeenCalled();
        expect(driver.generate).not.toHaveBeenCalled();
    });

    it('checa a folga com a estimativa da tarefa e o feature do pedido, antes de chamar o driver', async () => {
        const { metered, ledger, pricing, driver } = build();

        await metered.generate({ ...REQUEST, feature: 'whatsapp' });

        expect(ledger.assertRoom).toHaveBeenCalledWith('whatsapp', 'summary_month', 1234);
        const estimateUsage = pricing.costMicros.mock.calls[0]?.[1] as { inputTokens: number; outputTokens: number };
        expect(estimateUsage.outputTokens).toBe(6144);
        expect(estimateUsage.inputTokens).toBeGreaterThan(0);
        expect(ledger.assertRoom.mock.invocationCallOrder[0]).toBeLessThan(driver.generate.mock.invocationCallOrder[0] ?? 0);
    });

    it('responde com o custo real e lança no razão, com custo do gateway só para conferência', async () => {
        const { metered, ledger } = build();

        const response = await metered.generate(REQUEST);

        expect(response).toMatchObject({ text: 'resumo pronto', stopReason: 'end', costMicros: 1234, usage: RESULT.usage });
        expect(response.callId).toMatch(/^[0-9a-f-]{36}$/);
        expect(ledger.record).toHaveBeenCalledWith(
            expect.objectContaining({
                callId: response.callId,
                driver: 'gateway',
                modelId: 'vendor/model-a',
                servedModelId: 'vendor/served',
                costMicros: 1234,
                gatewayCostMicros: 1100,
                attempts: 2,
                latencyMs: 80,
                outcome: 'answered',
                referenceId: 'ref-1'
            })
        );
    });

    it('sem custo do gateway grava nulo', async () => {
        const { metered, ledger, driver } = build();
        driver.generate.mockResolvedValue({ ...RESULT, providerCostUsd: null });

        await metered.generate(REQUEST);

        expect(ledger.record).toHaveBeenCalledWith(expect.objectContaining({ gatewayCostMicros: null }));
    });

    it('escolhe o driver pelas credenciais: auto-hospedada usa a baseUrl e o modelo da conta', async () => {
        const { metered, router, driver } = build({ credentials: SELF_HOSTED });

        await metered.generate(REQUEST);

        expect(router.driverFor).toHaveBeenCalledWith('openai_compatible');
        expect(driver.generate).toHaveBeenCalledWith(expect.objectContaining({ credentials: SELF_HOSTED }));
    });

    it('em mock não pede credencial e usa o modelo da config', async () => {
        const { metered, router, credentials } = build({ mode: 'mock', credentials: null });

        await metered.generate(REQUEST);

        expect(credentials.resolve).not.toHaveBeenCalled();
        expect(router.driverFor).toHaveBeenCalledWith('mock');
    });

    it('falha do provedor grava failed com custo zero e repassa o erro', async () => {
        const { metered, ledger, driver } = build();
        driver.generate.mockRejectedValue(new LlmProviderUnavailableError('timeout', 3));

        await expect(metered.generate(REQUEST)).rejects.toMatchObject({ code: 'ai.provider_unavailable' });

        expect(ledger.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed', costMicros: 0, attempts: 3 }));
    });

    it('erro sem número de tentativas conta uma', async () => {
        const { metered, ledger, driver } = build();
        driver.generate.mockRejectedValue(new Error('boom'));

        await expect(metered.generate(REQUEST)).rejects.toThrow('boom');

        expect(ledger.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed', attempts: 1 }));
    });

    it('cap_reached sobe intacto, grava a chamada e o driver nem é chamado', async () => {
        const { metered, ledger, driver } = build();
        const capReached: CapReachedError = new CapReachedError('ai', '2026-12-01T03:00:00.000Z');
        ledger.assertRoom.mockRejectedValue(capReached);

        await expect(metered.generate(REQUEST)).rejects.toBe(capReached);

        expect(driver.generate).not.toHaveBeenCalled();
        expect(ledger.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'cap_reached', costMicros: 0 }));
    });

    it('outro erro da checagem sobe sem gravar', async () => {
        const { metered, ledger, driver } = build();
        ledger.assertRoom.mockRejectedValue(new Error('db'));

        await expect(metered.generate(REQUEST)).rejects.toThrow('db');

        expect(ledger.record).not.toHaveBeenCalled();
        expect(driver.generate).not.toHaveBeenCalled();
    });

    it('o mesmo pedido respondido além do limite em 24 h vira ai.repeated_request', async () => {
        const { metered, driver } = build({ repeats: 4 });

        await expect(metered.generate(REQUEST)).rejects.toMatchObject({ code: 'ai.repeated_request', status: 429 });

        expect(driver.generate).not.toHaveBeenCalled();
    });

    it('no limite ainda responde, e o hash é o mesmo para o mesmo corpo e diferente para outro', async () => {
        const { metered, ledger } = build({ repeats: 3 });

        await metered.generate(REQUEST);
        await metered.generate(REQUEST);
        await metered.generate({ ...REQUEST, system: 'outro' });

        const hashes: string[] = ledger.record.mock.calls.map((call) => (call[0] as { requestHash: string }).requestHash);
        expect(hashes[0]).toBe(hashes[1]);
        expect(hashes[2]).not.toBe(hashes[0]);
        expect(hashes[0]).toMatch(/^[0-9a-f]{64}$/);
        expect(hashes.join('')).not.toContain('MARCADOR-DO-PROMPT');
    });

    it('com responseSchema e texto sem objeto grava invalid, cobra e lança ai.invalid_response', async () => {
        const { metered, ledger, driver } = build();
        driver.generate.mockResolvedValue({ ...RESULT, text: 'não é json' });

        await expect(metered.generate({ ...REQUEST, responseSchema: { type: 'object' } })).rejects.toMatchObject({
            code: 'ai.invalid_response',
            status: 502
        });

        expect(ledger.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'invalid', costMicros: 1234 }));
    });

    it('com responseSchema e objeto válido responde; com chamada de ferramenta não exige JSON', async () => {
        const { metered, driver } = build();
        driver.generate.mockResolvedValueOnce({ ...RESULT, text: '```json\n{"a":1}\n```' });
        driver.generate.mockResolvedValueOnce({
            ...RESULT,
            text: '',
            toolUses: [{ toolUseId: 't', name: 'n', input: {} }],
            stopReason: 'tool_use'
        });

        const first = await metered.generate({ ...REQUEST, responseSchema: { type: 'object' } });
        const second = await metered.generate({ ...REQUEST, responseSchema: { type: 'object' } });

        expect(first.text).toContain('{"a":1}');
        expect(second.toolUses).toHaveLength(1);
    });

    it('tarefa desconhecida é erro de programação antes de qualquer coisa', async () => {
        const { metered, credentials } = build();

        await expect(metered.generate({ ...REQUEST, task: 'nope' as never })).rejects.toMatchObject({
            code: 'ai.unknown_task',
            status: 500
        });
        expect(credentials.resolve).not.toHaveBeenCalled();
    });
});
