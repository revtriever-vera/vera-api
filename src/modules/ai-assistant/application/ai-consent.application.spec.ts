import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { CurrentUserService } from '../../identity/services/current-user.service';
import { PlanGateService } from '../../plans/services/plan-gate.service';
import { AiConsent } from '../domain/ai-assistant.types';
import { AiConsentDomain } from '../domain/ai-consent.domain';
import { AI_NOTICE_VERSION } from '../domain/ai-notice';
import { AiAssistantLogService } from '../services/ai-assistant-log.service';
import { AiAssistantMetricsService } from '../services/ai-assistant-metrics.service';
import { AiConsentService } from '../services/ai-consent.service';
import { AiDataPurgeRegistry } from '../services/ai-data-purge.registry';
import { AiConsentApplication } from './ai-consent.application';

interface Setup {
    readonly role?: string;
    readonly current?: AiConsent | null;
    readonly available?: boolean;
}

function build({ role = 'owner', current = null, available = true }: Setup = {}) {
    const accept = vi.fn().mockResolvedValue(undefined);
    const revoke = vi.fn().mockResolvedValue(true);
    const purgeAll = vi.fn().mockResolvedValue(2);
    const revoked = vi.fn();
    const consentRevoked = vi.fn();
    const application: AiConsentApplication = new AiConsentApplication(
        { current: vi.fn().mockResolvedValue(current), accept } as unknown as AiConsentService,
        { revoke } as unknown as AiConsentDomain,
        { purgeAll } as unknown as AiDataPurgeRegistry,
        { allows: vi.fn().mockResolvedValue(available) } as unknown as PlanGateService,
        { require: vi.fn().mockResolvedValue({ role }) } as unknown as CurrentUserService,
        { get: () => ({ userId: 'user-1' }) } as unknown as AppContext,
        { revoked } as unknown as AiAssistantLogService,
        { consentRevoked } as unknown as AiAssistantMetricsService
    );
    return { application, accept, revoke, purgeAll, revoked, consentRevoked };
}

const GRANTED: AiConsent = {
    noticeVersion: AI_NOTICE_VERSION,
    revokedAt: null,
    grantedAt: new Date('2026-11-22T12:00:00.000Z'),
    source: 'privacy_settings'
} as AiConsent;

describe('AiConsentApplication', () => {
    it('sem linha: não permitido, precisa pedir e quem edita pode mudar', async () => {
        const view = await build().application.view();

        expect(view).toEqual({
            available: true,
            granted: false,
            needsConsent: true,
            noticeVersion: AI_NOTICE_VERSION,
            acceptedNoticeVersion: null,
            grantedAt: null,
            source: null,
            canChange: true
        });
    });

    it('com permissão da versão atual: concedida, sem novo pedido', async () => {
        const view = await build({ current: GRANTED }).application.view();

        expect(view).toMatchObject({
            granted: true,
            needsConsent: false,
            acceptedNoticeVersion: AI_NOTICE_VERSION,
            grantedAt: '2026-11-22T12:00:00.000Z',
            source: 'privacy_settings'
        });
    });

    it('aviso antigo volta a pedir e a leitura não pode mudar nem quando o plano não permite', async () => {
        const old: AiConsent = { ...GRANTED, noticeVersion: AI_NOTICE_VERSION - 1 };

        const view = await build({ current: old, role: 'viewer', available: false }).application.view();

        expect(view).toMatchObject({ granted: false, needsConsent: true, acceptedNoticeVersion: 0, canChange: false, available: false });
    });

    it('aceitar com a versão atual grava a origem e devolve o estado', async () => {
        const { application, accept } = build({ current: GRANTED });

        const view = await application.accept({ noticeVersion: AI_NOTICE_VERSION, source: 'summary_card' });

        expect(accept).toHaveBeenCalledWith({ source: 'summary_card' });
        expect(view.granted).toBe(true);
    });

    it('aceitar versão antiga responde ai.notice_outdated e não grava', async () => {
        const { application, accept } = build();

        await expect(application.accept({ noticeVersion: AI_NOTICE_VERSION - 1, source: 'summary_card' })).rejects.toMatchObject({
            code: 'ai.notice_outdated',
            status: 409
        });
        expect(accept).not.toHaveBeenCalled();
    });
});
