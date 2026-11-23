import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { MailerPort } from '../../../core/mail/mailer.port';
import { MemberRecipient, MemberRecipientsService } from '../../identity/services/member-recipients.service';
import { NoticePreferenceDomain } from '../domain/notice-preference.domain';
import { NoticeSendDomain } from '../domain/notice-send.domain';
import { NoticeOutcome, NoticeRequest, NoticeTypeDefinition } from '../domain/notices.types';
import { NoticesLogService } from './notices-log.service';
import { NoticeTypeRegistry } from './notice-type.registry';
import { UnsubscribeLinkService } from './unsubscribe-link.service';

interface PendingNotice {
    readonly template: string;
    readonly request: NoticeRequest;
    readonly recipient: MemberRecipient;
    readonly unsubscribeUrl: string;
}

@Injectable()
export class NoticeService {
    public constructor(
        private readonly types: NoticeTypeRegistry,
        private readonly preferences: NoticePreferenceDomain,
        private readonly sends: NoticeSendDomain,
        private readonly recipients: MemberRecipientsService,
        private readonly mailer: MailerPort,
        private readonly links: UnsubscribeLinkService,
        private readonly logs: NoticesLogService
    ) {}

    @AsCompany()
    public async notify(companyId: string, request: NoticeRequest): Promise<NoticeOutcome> {
        const definition: NoticeTypeDefinition = this.types.require(request.type);
        const optedOut: Set<string> = await this.preferences.disabledUserIds(request.type);
        const candidates: MemberRecipient[] = (await this.candidatesOf(request)).filter(
            (recipient: MemberRecipient): boolean => !optedOut.has(recipient.userId)
        );
        let sent: number = 0;
        for (const recipient of candidates) {
            sent += (await this.deliver(companyId, definition, request, recipient)) ? 1 : 0;
        }
        return { sent, skipped: candidates.length - sent };
    }

    private async candidatesOf(request: NoticeRequest): Promise<MemberRecipient[]> {
        if (request.userId === undefined) {
            return this.recipients.list();
        }
        const person: MemberRecipient | null = await this.recipients.find(request.userId);
        return person === null ? [] : [person];
    }

    private async deliver(
        companyId: string,
        definition: NoticeTypeDefinition,
        request: NoticeRequest,
        recipient: MemberRecipient
    ): Promise<boolean> {
        const noticeId: string | null = await this.sends.claim(recipient.userId, request.type, request.key);
        if (noticeId === null) {
            return false;
        }
        const unsubscribeUrl: string = this.links.urlFor({ companyId, userId: recipient.userId, type: request.type });
        await this.enqueueOrRelease(noticeId, { template: definition.template, request, recipient, unsubscribeUrl });
        this.logs.sent(request.type, noticeId);
        return true;
    }

    private async enqueueOrRelease(noticeId: string, mail: PendingNotice): Promise<void> {
        try {
            await this.mailer.enqueue({
                template: mail.template,
                locale: mail.recipient.locale,
                props: { ...mail.request.props, firstName: mail.recipient.firstName, unsubscribeUrl: mail.unsubscribeUrl },
                to: { email: mail.recipient.email, name: mail.recipient.firstName },
                unsubscribeUrl: mail.unsubscribeUrl,
                reference: `${mail.request.type}-${noticeId}`
            });
        } catch (error: unknown) {
            await this.sends.release(noticeId);
            this.logs.released(mail.request.type, noticeId, error);
            throw error;
        }
    }
}
