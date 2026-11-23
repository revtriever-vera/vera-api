import { describe, expect, it, vi } from 'vitest';
import { LlmConfig } from '../config/llm.config';
import { LlmAvailabilityService } from './llm-availability.service';

function build(mode: 'live' | 'mock', resolved: unknown) {
    const credentials = { resolve: vi.fn().mockResolvedValue(resolved) };
    return {
        service: new LlmAvailabilityService({ LLM_DRIVER: mode } as LlmConfig, credentials),
        credentials
    };
}

describe('LlmAvailabilityService', () => {
    it('com credencial resolvida está habilitado', async () => {
        expect(await build('live', { driver: 'gateway' }).service.enabled()).toBe(true);
    });

    it('sem credencial está desabilitado', async () => {
        expect(await build('live', null).service.enabled()).toBe(false);
    });

    it('com driver mock está habilitado sem consultar credencial', async () => {
        const { service, credentials } = build('mock', null);

        expect(await service.enabled()).toBe(true);
        expect(credentials.resolve).not.toHaveBeenCalled();
    });
});
