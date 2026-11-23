import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { MailerPort } from '../../../core/mail/mailer.port';
import { AppLocale } from '../../../shared/i18n/locale';
import { membersConfig } from '../config/members.config';
import { firstNameOf } from '../domain/first-name.util';
import { AccountInvite, Company, effectiveLocale, User } from '../domain/identity.types';
import {
    ACCOUNT_DELETED_MEMBER_TEMPLATE,
    MEMBER_INVITED_TEMPLATE,
    MEMBER_LEFT_TEMPLATE,
    MEMBER_REMOVED_TEMPLATE
} from '../templates/member.templates';

export interface InviteMail {
    readonly invite: AccountInvite;
    readonly token: string;
    readonly inviterName: string;
    readonly company: Company;
}

@Injectable()
export class MembersMailerService {
    public constructor(
        private readonly mailer: MailerPort,
        @Inject(membersConfig.KEY) private readonly config: ConfigType<typeof membersConfig>
    ) {}

    public linkOf(token: string): string {
        return `${this.baseUrl()}/convite/${token}`;
    }

    private baseUrl(): string {
        const url: string = this.config.APP_URL;
        return url.endsWith('/') ? url.slice(0, -1) : url;
    }

    public async invited(input: InviteMail): Promise<void> {
        await this.mailer.enqueue({
            template: MEMBER_INVITED_TEMPLATE,
            locale: input.company.locale as AppLocale,
            props: {
                inviterName: firstNameOf(input.inviterName),
                role: input.invite.role,
                link: this.linkOf(input.token),
                days: String(this.config.INVITE_TTL_DAYS)
            },
            to: { email: input.invite.email },
            reference: `${input.invite.id}-${String(input.invite.sendCount)}`
        });
    }

    public async removed(user: User, company: Company): Promise<void> {
        await this.toMember(MEMBER_REMOVED_TEMPLATE, user, company, `${user.id}-removed`);
    }

    public async left(user: User, company: Company): Promise<void> {
        await this.toMember(MEMBER_LEFT_TEMPLATE, user, company, `${user.id}-left`);
    }

    public async accountDeleted(user: User, company: Company, reference: string): Promise<void> {
        await this.toMember(ACCOUNT_DELETED_MEMBER_TEMPLATE, user, company, `${reference}-${user.id}`);
    }

    private async toMember(template: string, user: User, company: Company, reference: string): Promise<void> {
        await this.mailer.enqueue({
            template,
            locale: effectiveLocale(user, company),
            props: { firstName: firstNameOf(user.name), accountName: company.name },
            to: { email: user.email, name: firstNameOf(user.name) },
            reference
        });
    }
}
