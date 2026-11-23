import { Injectable } from '@nestjs/common';
import { MailerPort } from '../../../core/mail/mailer.port';
import { AppLocale } from '../../../shared/i18n/locale';
import { Company, User } from '../domain/identity.types';
import { UserDomain } from '../domain/user.domain';
import { MembersMailerService } from './members-mailer.service';

export interface ClosureNotice {
    readonly company: Company;
    readonly email: string;
    readonly firstName: string;
    readonly locale: AppLocale;
    readonly others: readonly User[];
}

export const ACCOUNT_DELETED_TEMPLATE_NAME: string = 'account-deleted';

@Injectable()
export class AccountClosureMailer {
    public constructor(
        private readonly mailer: MailerPort,
        private readonly users: UserDomain,
        private readonly memberMailer: MembersMailerService
    ) {}

    public async othersOf(actorId: string): Promise<User[]> {
        const members: User[] = await this.users.listMembers();
        return members.filter((member: User): boolean => member.id !== actorId);
    }

    public async notifyAll(notice: ClosureNotice, reference: string): Promise<void> {
        await this.mailer.enqueue({
            template: ACCOUNT_DELETED_TEMPLATE_NAME,
            locale: notice.locale,
            props: { firstName: notice.firstName },
            to: { email: notice.email, name: notice.firstName },
            reference
        });
        for (const member of notice.others) {
            await this.memberMailer.accountDeleted(member, notice.company, reference);
        }
    }
}
