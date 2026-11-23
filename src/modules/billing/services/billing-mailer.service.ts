import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { MailerPort } from '../../../core/mail/mailer.port';
import { AppLocale } from '../../../shared/i18n/locale';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { OwnerRecipient, OwnerRecipientsService } from '../../identity/services/owner-recipients.service';
import { billingConfig } from '../config/billing.config';
import { BillingNotificationDomain } from '../domain/billing-notification.domain';
import { NotificationKind } from '../domain/billing.types';
import { REFUND_REQUESTED_TEMPLATE } from '../templates/billing.templates';

export interface BillingNotice {
    readonly kind: NotificationKind;
    readonly subjectId: string;
    readonly paidThrough?: Date | null;
    readonly graceEndsAt?: Date | null;
}

function dateOf(at: Date | null | undefined, locale: AppLocale, timeZone: string): string {
    return at === null || at === undefined ? '' : new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone }).format(at);
}

@Injectable()
export class BillingMailerService {
    public constructor(
        @Inject(billingConfig.KEY) private readonly config: ConfigType<typeof billingConfig>,
        private readonly mailer: MailerPort,
        private readonly owners: OwnerRecipientsService,
        private readonly timezone: CompanyTimezoneService,
        private readonly notifications: BillingNotificationDomain
    ) {}

    public async notify(notice: BillingNotice): Promise<boolean> {
        if (!(await this.notifications.recordOnce(notice.subjectId, notice.kind))) {
            return false;
        }
        const recipients: OwnerRecipient[] = await this.owners.list();
        const timeZone: string = await this.timezone.timezoneOfCompany();
        for (const owner of recipients) {
            await this.mailer.enqueue({
                template: notice.kind,
                locale: owner.locale,
                props: {
                    firstName: owner.firstName,
                    url: `${this.config.APP_URL}/settings/plan`,
                    paidThrough: dateOf(notice.paidThrough, owner.locale, timeZone),
                    graceEndsAt: dateOf(notice.graceEndsAt, owner.locale, timeZone)
                },
                to: { email: owner.email, name: owner.firstName },
                reference: `${notice.subjectId}-${owner.userId}`
            });
        }
        return true;
    }

    public async notifyRefundRequested(companyId: string, subscriptionId: string): Promise<void> {
        const email: string | null = this.config.BILLING_REFUND_NOTIFY_EMAIL;
        if (email === null) {
            return;
        }
        await this.mailer.enqueue({
            template: REFUND_REQUESTED_TEMPLATE,
            locale: 'pt-BR',
            props: { companyId, subscriptionId },
            to: { email },
            reference: subscriptionId
        });
    }
}
