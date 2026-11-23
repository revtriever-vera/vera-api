import { describe, expect, it, vi } from 'vitest';
import { GatewayLlmDriver } from '../drivers/gateway-llm.driver';
import { OpenAiCompatibleLlmDriver } from '../drivers/openai-compatible-llm.driver';
import { ProviderCallError } from '../drivers/provider-failures';
import { LlmProviderUnavailableError } from '../llm.errors';
import { LlmCredentials } from '../llm.types';
import { LlmProbeService } from './llm-probe.service';

const GATEWAY: LlmCredentials = { driver: 'gateway', apiKey: 'k', modelId: 'vendor/m' };
const SELF: LlmCredentials = { driver: 'openai_compatible', baseUrl: 'http://h/v1', apiKey: 'k', modelId: 'local' };

function build() {
    const gateway = { generate: vi.fn().mockResolvedValue({}) };
    const openai = { generate: vi.fn().mockResolvedValue({}) };
    const service: LlmProbeService = new LlmProbeService(
        gateway as unknown as GatewayLlmDriver,
        openai as unknown as OpenAiCompatibleLlmDriver
    );
    return { service, gateway, openai };
}

function unavailable(status: number | null, detail: string, retryable: boolean): LlmProviderUnavailableError {
    return new LlmProviderUnavailableError('x', 1, new ProviderCallError(status, detail, retryable));
}

describe('LlmProbeService', () => {
    it('chamada mínima (1 token, sem tentativas) com o driver das credenciais, devolve ok', async () => {
        const { service, gateway, openai } = build();

        expect(await service.test(GATEWAY)).toEqual({ ok: true });
        expect(await service.test(SELF)).toEqual({ ok: true });

        const call = gateway.generate.mock.calls[0]?.[0] as { spec: { maxOutputTokens: number; maxRetries: number } };
        expect(call.spec).toMatchObject({ maxOutputTokens: 1, maxRetries: 0 });
        expect(openai.generate).toHaveBeenCalledTimes(1);
    });

    it.each([
        [unavailable(401, 'x', false), 'unauthorized'],
        [unavailable(404, 'x', false), 'model_not_found'],
        [unavailable(null, 'fetch failed', true), 'unreachable'],
        [unavailable(null, 'timeout', true), 'timeout'],
        [unavailable(null, 'AI_JSONParseError', false), 'invalid_response']
    ])('traduz o motivo da falha', async (error: LlmProviderUnavailableError, reason: string) => {
        const { service, gateway } = build();
        gateway.generate.mockRejectedValue(error);

        expect(await service.test(GATEWAY)).toEqual({ ok: false, reason });
    });

    it('erro inesperado vira unreachable', async () => {
        const { service, openai } = build();
        openai.generate.mockRejectedValue(new Error('boom'));

        expect(await service.test(SELF)).toEqual({ ok: false, reason: 'unreachable' });
    });
});
