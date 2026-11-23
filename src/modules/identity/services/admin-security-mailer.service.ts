import { Injectable } from '@nestjs/common';
import { MailerPort } from '../../../core/mail/mailer.port';
import { AppLocale, DEFAULT_LOCALE } from '../../../shared/i18n/locale';
import { firstNameOf } from '../domain/first-name.util';
import { User } from '../domain/identity.types';
import { ADMIN_RECOVERY_CODE_USED_TEMPLATE, ADMIN_TOTP_ACTIVATED_TEMPLATE } from '../templates/admin-security.templates';

@Injectable()
export class AdminSecurityMailerService {
    public constructor(private readonly mailer: MailerPort) {}

    public async totpActivated(user: User): Promise<void> {
        await this.send(ADMIN_TOTP_ACTIVATED_TEMPLATE, user, `${user.id}-${String(Date.now())}`);
    }

    public async recoveryCodeUsed(user: User): Promise<void> {
        await this.send(ADMIN_RECOVERY_CODE_USED_TEMPLATE, user, `${user.id}-${String(Date.now())}`);
    }

    private async send(template: string, user: User, reference: string): Promise<void> {
        await this.mailer.enqueue({
            template,
            locale: (user.locale ?? DEFAULT_LOCALE) as AppLocale,
            props: {},
            to: { email: user.email, name: firstNameOf(user.name) },
            reference
        });
    }
}
