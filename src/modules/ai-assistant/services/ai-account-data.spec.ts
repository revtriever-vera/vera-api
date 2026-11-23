import { describe, expect, it, vi } from 'vitest';
import { LlmAvailabilityService } from '../../../core/llm/services/llm-availability.service';
import { AiConsent } from '../domain/ai-assistant.types';
import { AiConsentDomain } from '../domain/ai-consent.domain';
import { AiConsentEraser } from './ai-consent.eraser';
import { AiConsentExporter } from './ai-consent.exporter';
import { AiFeatureAvailability } from './ai-feature-availability';

describe('dados da conta da permissão de IA', () => {
    it('exporta data, versão e origem, e nada quando nunca houve permissão', async () => {
        const consent = {
            grantedAt: new Date('2026-11-22T12:00:00.000Z'),
            noticeVersion: 1,
            source: 'summary_card',
            revokedAt: new Date('2026-11-23T12:00:00.000Z'),
            acceptedByUserId: 'user-1'
        } as AiConsent;
        const withConsent = new AiConsentExporter({ current: vi.fn().mockResolvedValue(consent) } as unknown as AiConsentDomain);
        const without = new AiConsentExporter({ current: vi.fn().mockResolvedValue(null) } as unknown as AiConsentDomain);

        expect(await withConsent.exportAll()).toEqual({
            grantedAt: '2026-11-22T12:00:00.000Z',
            noticeVersion: 1,
            source: 'summary_card',
            revokedAt: '2026-11-23T12:00:00.000Z'
        });
        expect(await without.exportAll()).toBeNull();
        expect(withConsent.area).toBe('ai_consent');
    });

    it('exporta revokedAt nulo quando a permissão está ativa', async () => {
        const consent = {
            grantedAt: new Date('2026-11-22T12:00:00.000Z'),
            noticeVersion: 1,
            source: 'privacy_settings',
            revokedAt: null
        } as AiConsent;

        const exported = await new AiConsentExporter({
            current: vi.fn().mockResolvedValue(consent)
        } as unknown as AiConsentDomain).exportAll();

        expect(exported?.revokedAt).toBeNull();
    });

    it('o apagador declara a área (a exclusão em si é provada na integração)', () => {
        const eraser = new AiConsentEraser({ eraseAll: vi.fn().mockResolvedValue(1) } as unknown as AiConsentDomain);

        expect(eraser.area).toBe('ai_consents');
    });

    it('a disponibilidade de ai segue a do modelo', async () => {
        const availability = new AiFeatureAvailability({ enabled: vi.fn().mockResolvedValue(false) } as unknown as LlmAvailabilityService);

        expect(availability.feature).toBe('ai');
        expect(await availability.enabled()).toBe(false);
    });
});
