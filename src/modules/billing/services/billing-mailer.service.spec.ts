import { describe, expect, it, vi } from 'vitest';
import { MailerPort } from '../../../core/mail/mailer.port';
import { AppLocale } from '../../../shared/i18n/locale';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { OwnerRecipientsService } from '../../identity/services/owner-recipients.service';
import { parseBillingConfig } from '../config/billing.config';
import { BillingNotificationDomain } from '../domain/billing-notification.domain';
import { BillingMailerService, BillingNotice } from './billing-mailer.service';

function build(locale: AppLocale): { service: BillingMailerService; enqueue: ReturnType<typeof vi.fn> } {
    const enqueue: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const service: BillingMailerService = new BillingMailerService(
        parseBillingConfig({ IS_LOCAL: 'true' }),
        { enqueue } as unknown as MailerPort,
        { list: vi.fn().mockResolvedValue([{ userId: 'u1', email: 'dono@example.test', firstName: 'Ana', locale }]) } as unknown as OwnerRecipientsService,
        { timezoneOfCompany: vi.fn().mockResolvedValue('America/Sao_Paulo') } as unknown as CompanyTimezoneService,
        { recordOnce: vi.fn().mockResolvedValue(true) } as unknown as BillingNotificationDomain
    );
    return { service, enqueue };
}

async function paidThroughSent(locale: AppLocale, notice: Partial<BillingNotice>): Promise<string> {
    const { service, enqueue } = build(locale);
    await service.notify({ kind: 'premium_activated', subjectId: 'sub-1', ...notice } as BillingNotice);
    const call = enqueue.mock.calls[0] as [{ props: Record<string, string> }];
    return call[0].props['paidThrough'] ?? '';
}

describe('BillingMailerService: datas do e-mail', () => {
    it('data de dia (meia-noite UTC do motor) sai como o dia, sem voltar um no fuso de São Paulo', async () => {
        const day: Date = new Date('2026-12-23T00:00:00.000Z');

        expect(await paidThroughSent('pt-BR', { paidThroughDay: day })).toBe('23 de dezembro de 2026');
        expect(await paidThroughSent('en', { paidThroughDay: day })).toBe('December 23, 2026');
    });

    it('instante continua formatado no fuso da company', async () => {
        const instant: Date = new Date('2026-12-24T02:00:00.000Z');

        expect(await paidThroughSent('pt-BR', { paidThrough: instant })).toBe('23 de dezembro de 2026');
    });

    it('sem data, o campo vai vazio', async () => {
        expect(await paidThroughSent('pt-BR', {})).toBe('');
    });
});
