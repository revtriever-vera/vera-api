import { describe, expect, it, vi } from 'vitest';
import { LlmCredentialsHolder } from '../../../core/llm/ports/llm-credentials.holder';
import { IntegrationCredentialsService } from './integration-credentials.service';
import { IntegrationLlmCredentialsAdapter } from './integration-llm-credentials.adapter';

function build(stored: unknown) {
    const integrations = { resolve: vi.fn().mockResolvedValue(stored) };
    const holder = { register: vi.fn() };
    const adapter: IntegrationLlmCredentialsAdapter = new IntegrationLlmCredentialsAdapter(
        integrations as unknown as IntegrationCredentialsService,
        holder as unknown as LlmCredentialsHolder
    );
    return { adapter, integrations, holder };
}

describe('IntegrationLlmCredentialsAdapter', () => {
    it('se registra no holder do core/llm ao subir', () => {
        const { adapter, holder } = build(null);

        adapter.onModuleInit();

        expect(holder.register).toHaveBeenCalledWith(adapter);
    });

    it('sem credencial devolve nulo', async () => {
        const { adapter, integrations } = build(null);

        expect(await adapter.resolve()).toBeNull();
        expect(integrations.resolve).toHaveBeenCalledWith('llm');
    });

    it('na hospedada devolve a chave do gateway da instância e o modelo', async () => {
        const { adapter } = build({ kind: 'llm', baseUrl: 'https://gw/v1', apiKey: 'k', model: 'vendor/m', provider: 'gateway' });

        expect(await adapter.resolve()).toEqual({ driver: 'gateway', apiKey: 'k', modelId: 'vendor/m' });
    });

    it('na auto-hospedada devolve a URL, a chave e o modelo da company', async () => {
        const { adapter } = build({
            kind: 'llm',
            baseUrl: 'http://local/v1',
            apiKey: 'k',
            model: 'local-model',
            provider: 'openai_compatible'
        });

        expect(await adapter.resolve()).toEqual({
            driver: 'openai_compatible',
            baseUrl: 'http://local/v1',
            apiKey: 'k',
            modelId: 'local-model'
        });
    });
});
