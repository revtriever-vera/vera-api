import { describe, expect, it, vi } from 'vitest';
import { LlmProviderDisabledError } from '../../../core/llm/llm.errors';
import { AiConsentRequiredError } from '../domain/ai-assistant.errors';
import { AskVeraAccessService } from './ask-vera-access.service';

function build(options: { gate?: Error; consent?: Error; enabled?: boolean } = {}) {
    const gate = { assert: vi.fn(() => (options.gate === undefined ? Promise.resolve() : Promise.reject(options.gate))) };
    const consent = { assertGranted: vi.fn(() => (options.consent === undefined ? Promise.resolve() : Promise.reject(options.consent))) };
    const availability = { enabled: vi.fn().mockResolvedValue(options.enabled ?? true) };
    const service: AskVeraAccessService = new AskVeraAccessService(gate as never, consent as never, availability as never);
    return { service, gate, consent, availability };
}

describe('AskVeraAccessService', () => {
    it('no WhatsApp confere o plano whatsapp e a permissão, como antes', async () => {
        const { service, gate, consent } = build();
        await service.assertAllowed({ channel: 'whatsapp', feature: 'whatsapp' });
        expect(gate.assert).toHaveBeenCalledWith('whatsapp');
        expect(consent.assertGranted).toHaveBeenCalled();
    });

    it('no app com ai confere o plano ai e a permissão', async () => {
        const { service, gate, consent } = build();
        await service.assertAllowed({ channel: 'app', feature: 'ai' });
        expect(gate.assert).toHaveBeenCalledWith('ai');
        expect(consent.assertGranted).toHaveBeenCalled();
    });

    it('no app com ai sem permissão sobe ai.consent_required', async () => {
        const { service } = build({ consent: new AiConsentRequiredError() });
        await expect(service.assertAllowed({ channel: 'app', feature: 'ai' })).rejects.toMatchObject({ code: 'ai.consent_required' });
    });

    it('no app com help passa no Free, sem plano nem permissão, só com o modelo disponível', async () => {
        const { service, gate, consent, availability } = build();
        await service.assertAllowed({ channel: 'app', feature: 'help' });
        expect(availability.enabled).toHaveBeenCalled();
        expect(gate.assert).not.toHaveBeenCalled();
        expect(consent.assertGranted).not.toHaveBeenCalled();
    });

    it('no app com help sem modelo sobe ai.provider_disabled', async () => {
        const { service } = build({ enabled: false });
        await expect(service.assertAllowed({ channel: 'app', feature: 'help' })).rejects.toBeInstanceOf(LlmProviderDisabledError);
    });
});
