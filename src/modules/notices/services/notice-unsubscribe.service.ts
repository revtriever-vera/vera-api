import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { MemberRecipient, MemberRecipientsService } from '../../identity/services/member-recipients.service';
import { NoticePreferenceDomain } from '../domain/notice-preference.domain';
import { InvalidUnsubscribeTokenError } from '../domain/notices.errors';
import { NoticesLogService } from './notices-log.service';
import { NoticeTypeRegistry } from './notice-type.registry';
import { UnsubscribeSubject } from './unsubscribe-link.service';

@Injectable()
export class NoticeUnsubscribeService {
    public constructor(
        private readonly types: NoticeTypeRegistry,
        private readonly preferences: NoticePreferenceDomain,
        private readonly recipients: MemberRecipientsService,
        private readonly logs: NoticesLogService
    ) {}

    @AsCompany()
    public async unsubscribe(_companyId: string, subject: UnsubscribeSubject): Promise<void> {
        const types: string[] = subject.type.split(',');
        if (!types.every((type: string): boolean => this.types.has(type))) {
            throw new InvalidUnsubscribeTokenError();
        }
        const person: MemberRecipient | null = await this.recipients.find(subject.userId);
        if (person === null) {
            return;
        }
        for (const type of types) {
            await this.preferences.set(subject.userId, type, false);
            this.logs.unsubscribed(type);
        }
    }
}
