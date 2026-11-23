import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { AiConsent } from '../domain/ai-assistant.types';
import { AiConsentDomain } from '../domain/ai-consent.domain';
import { AI_NOTICE_VERSION } from '../domain/ai-notice';
import { AiAssistantLogService } from './ai-assistant-log.service';
import { AiAssistantMetricsService } from './ai-assistant-metrics.service';
import { AiConsentService, isGrantedBy } from './ai-consent.service';

function consent(overrides: Partial<AiConsent>): AiConsent {
    return { noticeVersion: AI_NOTICE_VERSION, revokedAt: null, ...overrides } as AiConsent;
}

function build(current: AiConsent | null, userId: string | null = 'user-1') {
    const grant = vi.fn().mockResolvedValue(consent({}));
    const granted = vi.fn();
    const consentGranted = vi.fn();
    const service: AiConsentService = new AiConsentService(
        { current: vi.fn().mockResolvedValue(current), grant } as unknown as AiConsentDomain,
        { get: () => ({ userId: userId ?? undefined }) } as unknown as AppContext,
        { granted } as unknown as AiAssistantLogService,
        { consentGranted } as unknown as AiAssistantMetricsService
    );
    return { service, grant, granted, consentGranted };
}

describe('AiConsentService', () => {
    it('só vale a permissão da versão atual do aviso e que não foi desligada', () => {
        expect(isGrantedBy(null)).toBe(false);
        expect(isGrantedBy(consent({}))).toBe(true);
        expect(isGrantedBy(consent({ noticeVersion: AI_NOTICE_VERSION - 1 }))).toBe(false);
        expect(isGrantedBy(consent({ revokedAt: new Date() }))).toBe(false);
    });

    it('assertGranted passa com permissão e lança ai.consent_required sem ela', async () => {
        await expect(build(consent({})).service.assertGranted()).resolves.toBeUndefined();
        await expect(build(null).service.assertGranted()).rejects.toMatchObject({ code: 'ai.consent_required', status: 403 });
        expect(await build(consent({})).service.isGranted()).toBe(true);
    });

    it('aceitar grava a versão atual, a origem e a pessoa da sessão, e registra log e métrica', async () => {
        const { service, grant, granted, consentGranted } = build(null);

        await service.accept({ source: 'whatsapp_link' });

        expect(grant).toHaveBeenCalledWith({ noticeVersion: AI_NOTICE_VERSION, source: 'whatsapp_link', userId: 'user-1' });
        expect(granted).toHaveBeenCalledWith(AI_NOTICE_VERSION, 'whatsapp_link');
        expect(consentGranted).toHaveBeenCalledWith('whatsapp_link');
    });

    it('aceitar fora de uma sessão com pessoa grava sem pessoa', async () => {
        const { service, grant } = build(null, null);

        await service.accept({ source: 'summary_card' });

        expect(grant).toHaveBeenCalledWith(expect.objectContaining({ userId: null }));
    });
});
