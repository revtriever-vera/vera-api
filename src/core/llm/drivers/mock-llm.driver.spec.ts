import { describe, expect, it } from 'vitest';
import { LlmDriverCall } from './llm-driver';
import { MockLlmDriver } from './mock-llm.driver';

const CALL: LlmDriverCall = {
    credentials: { driver: 'gateway', apiKey: '', modelId: 'm' },
    spec: {
        task: 'summary_month',
        model: 'primary',
        maxOutputTokens: 10,
        maxCostMicros: 1,
        temperature: 0,
        reasoning: 'provider-default',
        timeoutMs: 1,
        maxRetries: 0,
        evalThreshold: 0,
        promptVersion: 'v1'
    },
    request: { task: 'summary_month', system: 'sys', messages: [{ role: 'user', content: 'oi' }] }
};

describe('MockLlmDriver', () => {
    it('ecoa a última mensagem com tokens estimados', async () => {
        const result = await new MockLlmDriver().generate(CALL);

        expect(result.text).toBe('[mock] oi');
        expect(result.usage.inputTokens).toBeGreaterThan(0);
        expect(result.usage.outputTokens).toBeGreaterThan(0);
        expect(result.stopReason).toBe('end');
    });

    it('ecoa vazio quando a última mensagem não é texto simples', async () => {
        const result = await new MockLlmDriver().generate({
            ...CALL,
            request: { ...CALL.request, messages: [{ role: 'user', content: [{ kind: 'text', text: 'x' }] }] }
        });

        expect(result.text).toBe('[mock]');
    });

    it('responde a fila na ordem, com ferramentas e uso próprios', async () => {
        const driver: MockLlmDriver = new MockLlmDriver();
        driver.enqueue('um');
        driver.enqueue({
            text: '',
            toolUses: [{ toolUseId: 't', name: 'n', input: {} }],
            usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3 }
        });

        expect((await driver.generate(CALL)).text).toBe('um');
        const second = await driver.generate(CALL);
        expect(second.stopReason).toBe('tool_use');
        expect(second.usage.cacheReadTokens).toBe(3);
    });

    it('falha na vez da falha enfileirada', async () => {
        const driver: MockLlmDriver = new MockLlmDriver();
        driver.enqueueFailure(new Error('boom'));

        await expect(driver.generate(CALL)).rejects.toThrow('boom');
        expect((await driver.generate(CALL)).text).toBe('[mock] oi');
    });
});
