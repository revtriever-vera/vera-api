import { Injectable } from '@nestjs/common';
import { MailerPort } from '../../../core/mail/mailer.port';
import { AppLocale } from '../../../shared/i18n/locale';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { OwnerRecipient, OwnerRecipientsService } from '../../identity/services/owner-recipients.service';

export interface TrialNotice {
    readonly companyId: string;
    readonly template: string;
    readonly endsAt: Date;
}

function dateOf(at: Date, locale: AppLocale, timeZone: string): string {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone }).format(at);
}

@Injectable()
export class TrialNotifier {
    public constructor(
        private readonly mailer: MailerPort,
        private readonly owners: OwnerRecipientsService,
        private readonly timezone: CompanyTimezoneService
    ) {}

    public async notify(notice: TrialNotice): Promise<number> {
        const recipients: OwnerRecipient[] = await this.owners.list();
        const timeZone: string = await this.timezone.timezoneOfCompany();
        for (const owner of recipients) {
            await this.mailer.enqueue({
                template: notice.template,
                locale: owner.locale,
                props: { firstName: owner.firstName, endsAt: dateOf(notice.endsAt, owner.locale, timeZone) },
                to: { email: owner.email, name: owner.firstName },
                reference: `${notice.companyId}-${notice.endsAt.toISOString()}-${owner.userId}`
            });
        }
        return recipients.length;
    }
}
