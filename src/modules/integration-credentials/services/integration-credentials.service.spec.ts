import { describe, expect, it, vi } from 'vitest';
import { parseIntegrationCredentialsConfig } from '../config/integration-credentials.config';
import { IntegrationCredentialsDomain } from '../domain/integration-credentials.domain';
import { IntegrationUnreadableError } from '../domain/integration-credentials.errors';
import { IntegrationCredential } from '../domain/integration.types';
import { PlanGateService } from '../../plans/services/plan-gate.service';
import { InstanceCredentialsService } from './instance-credentials.service';
import { IntegrationCredentialsService } from './integration-credentials.service';
import { IntegrationVaultService } from './integration-vault.service';
import { IntegrationsLogService } from './integrations-log.service';

const ENV = { AI_GATEWAY_API_KEY: 'gw-key', LLM_MODEL: 'm', LLM_BASE_URL: 'https://llm.example.com/v1', LLM_API_KEY: 'env-key' };
const OWN = { kind: 'llm', baseUrl: 'https://own.example.com', apiKey: 'own-key', model: 'own', provider: 'openai_compatible' };

function build(mode: 'hosted' | 'self_hosted', row: boolean, fallback: boolean, unreadable: boolean = false) {
    const config = parseIntegrationCredentialsConfig({ ...ENV, INTEGRATIONS_INSTANCE_FALLBACK: String(fallback) });
    const find = vi.fn().mockResolvedValue(row ? ({ id: 'r' } as IntegrationCredential) : null);
    const open = unreadable ? vi.fn().mockRejectedValue(new IntegrationUnreadableError()) : vi.fn().mockResolvedValue(OWN);
    const unreadableLog = vi.fn();
    const service = new IntegrationCredentialsService(
        { find } as unknown as IntegrationCredentialsDomain,
        { open } as unknown as IntegrationVaultService,
        new InstanceCredentialsService(config),
        { mode: (): string => mode } as unknown as PlanGateService,
        { unreadable: unreadableLog } as unknown as IntegrationsLogService,
        config
    );
    return { service, find, unreadableLog };
}

describe('IntegrationCredentialsService', () => {
    it('hosted devolve o gateway da instância e nunca lê a tabela', async () => {
        const { service, find } = build('hosted', true, false);

        expect(await service.resolve('llm')).toMatchObject({ provider: 'gateway', apiKey: 'gw-key', model: 'm' });
        expect(await service.has('llm')).toBe(true);
        expect(await service.resolve('google')).toBeNull();
        expect(find).not.toHaveBeenCalled();
    });

    it('self_hosted com linha usa a linha', async () => {
        const { service } = build('self_hosted', true, true);

        expect(await service.resolve('llm')).toMatchObject({ apiKey: 'own-key' });
        expect(await service.has('llm')).toBe(true);
    });

    it('self_hosted sem linha usa a instância só com o fallback ligado', async () => {
        const withFallback = build('self_hosted', false, true).service;
        const without = build('self_hosted', false, false).service;

        expect(await withFallback.resolve('llm')).toMatchObject({ provider: 'openai_compatible', apiKey: 'env-key' });
        expect(await withFallback.has('llm')).toBe(true);
        expect(await withFallback.resolve('whatsapp')).toBeNull();
        expect(await withFallback.has('whatsapp')).toBe(false);
        expect(await without.resolve('llm')).toBeNull();
        expect(await without.has('llm')).toBe(false);
    });

    it('trata segredo ilegível como ausente e registra', async () => {
        const { service, unreadableLog } = build('self_hosted', true, true, true);

        expect(await service.resolve('llm')).toBeNull();
        expect(unreadableLog).toHaveBeenCalledWith('llm');
    });
});
