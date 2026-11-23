import { Injectable } from '@nestjs/common';
import { MailerPort } from '../../../core/mail/mailer.port';
import { NOTICE_KINDS, NoticeKind } from '../../../core/usage/usage.types';
import { AppLocale } from '../../../shared/i18n/locale';
import { OwnerRecipient, OwnerRecipientsService } from '../../identity/services/owner-recipients.service';
import { USAGE_PAUSED_TEMPLATE, USAGE_WARNING_TEMPLATE } from '../templates/usage.templates';

const BPS_PER_PERCENT: number = 100;
const MONTHS_IN_YEAR: number = 12;

export interface UsageNotice {
    readonly companyId: string;
    readonly period: string;
    readonly kind: NoticeKind;
    readonly usedBps: number;
}

function monthName(year: number, monthIndex: number, locale: AppLocale): string {
    const wrappedYear: number = year + Math.floor(monthIndex / MONTHS_IN_YEAR);
    const wrappedMonth: number = ((monthIndex % MONTHS_IN_YEAR) + MONTHS_IN_YEAR) % MONTHS_IN_YEAR;
    return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(wrappedYear, wrappedMonth, 1)));
}

@Injectable()
export class UsageNotifier {
    public constructor(
        private readonly mailer: MailerPort,
        private readonly owners: OwnerRecipientsService
    ) {}

    public async notify(notice: UsageNotice): Promise<number> {
        const recipients: OwnerRecipient[] = await this.owners.list();
        for (const owner of recipients) {
            await this.send(notice, owner);
        }
        return recipients.length;
    }

    private async send(notice: UsageNotice, owner: OwnerRecipient): Promise<void> {
        const year: number = Number(notice.period.slice(0, 4));
        const monthIndex: number = Number(notice.period.slice(5, 7)) - 1;
        await this.mailer.enqueue({
            template: notice.kind === NOTICE_KINDS.warning ? USAGE_WARNING_TEMPLATE : USAGE_PAUSED_TEMPLATE,
            locale: owner.locale,
            props: {
                firstName: owner.firstName,
                percent: String(Math.floor(notice.usedBps / BPS_PER_PERCENT)),
                month: monthName(year, monthIndex, owner.locale),
                resetMonth: monthName(year, monthIndex + 1, owner.locale)
            },
            to: { email: owner.email, name: owner.firstName },
            reference: `${notice.companyId}-${notice.period}-${notice.kind}-${owner.userId}`
        });
    }
}
