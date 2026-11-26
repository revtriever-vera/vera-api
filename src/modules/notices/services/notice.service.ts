import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { EnqueueMailRequest, MailerPort } from '../../../core/mail/mailer.port';
import { MemberRecipient, MemberRecipientsService } from '../../identity/services/member-recipients.service';
import { NoticePreferenceDomain } from '../domain/notice-preference.domain';
import { NoticeSendDomain } from '../domain/notice-send.domain';
import {
    DIGEST_ENTRIES_PROP,
    DIGEST_UNSUBSCRIBE_PROP,
    DigestEntry,
    DigestRequest,
    NoticeOutcome,
    NoticeRequest,
    NoticeTypeDefinition
} from '../domain/notices.types';
import { NoticesLogService } from './notices-log.service';
import { NoticeTypeRegistry } from './notice-type.registry';
import { UnsubscribeLinkService } from './unsubscribe-link.service';

interface ClaimedEntry {
    readonly entry: DigestEntry;
    readonly noticeId: string;
}

interface DigestContext {
    readonly extra: Readonly<Record<string, string>>;
    readonly urls: Readonly<Record<string, string>>;
    readonly recipient: MemberRecipient;
}

function digestEntriesFor(
    entries: readonly DigestEntry[],
    optedOut: ReadonlyMap<string, ReadonlySet<string>>,
    userId: string
): DigestEntry[] {
    return entries.filter((entry: DigestEntry): boolean => optedOut.get(entry.type)?.has(userId) !== true);
}

export { DIGEST_ENTRIES_PROP, DIGEST_UNSUBSCRIBE_PROP };
export type { DigestEntry, DigestRequest };

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

    @AsCompany()
    public async notifyDigest(companyId: string, request: DigestRequest): Promise<NoticeOutcome> {
        const optedOut: Map<string, Set<string>> = await this.optedOutByType(request.entries);
        const candidates: MemberRecipient[] = await this.recipients.list();
        let sent: number = 0;
        for (const recipient of candidates) {
            const wanted: DigestEntry[] = digestEntriesFor(request.entries, optedOut, recipient.userId);
            sent += (await this.deliverDigest(companyId, wanted, request.props, recipient)) ? 1 : 0;
        }
        return { sent, skipped: candidates.length - sent };
    }

    private async optedOutByType(entries: readonly DigestEntry[]): Promise<Map<string, Set<string>>> {
        const optedOut: Map<string, Set<string>> = new Map();
        for (const type of new Set(entries.map((entry: DigestEntry): string => entry.type))) {
            this.types.require(type);
            optedOut.set(type, await this.preferences.disabledUserIds(type));
        }
        return optedOut;
    }

    private async deliverDigest(
        companyId: string,
        wanted: readonly DigestEntry[],
        extra: Readonly<Record<string, string>>,
        recipient: MemberRecipient
    ): Promise<boolean> {
        const claimed: ClaimedEntry[] = await this.claimEntries(recipient.userId, wanted);
        const [first]: ClaimedEntry[] = claimed;
        if (first === undefined) {
            return false;
        }
        const urls: Record<string, string> = this.linksOf(companyId, recipient.userId, claimed);
        try {
            await this.mailer.enqueue(this.digestMail(claimed, first, { extra, urls, recipient }));
        } catch (error: unknown) {
            await this.releaseAll(claimed);
            this.logs.released(first.entry.type, first.noticeId, error);
            throw error;
        }
        this.logs.sent(first.entry.type, first.noticeId);
        return true;
    }

    private async claimEntries(userId: string, wanted: readonly DigestEntry[]): Promise<ClaimedEntry[]> {
        const claimed: ClaimedEntry[] = [];
        for (const entry of wanted) {
            const noticeId: string | null = await this.sends.claim(userId, entry.type, entry.key);
            if (noticeId !== null) {
                claimed.push({ entry, noticeId });
            }
        }
        return claimed;
    }

    private async releaseAll(claimed: readonly ClaimedEntry[]): Promise<void> {
        for (const { noticeId } of claimed) {
            await this.sends.release(noticeId);
        }
    }

    private linksOf(companyId: string, userId: string, claimed: readonly ClaimedEntry[]): Record<string, string> {
        const urls: Record<string, string> = {};
        for (const { entry } of claimed) {
            urls[entry.type] = this.links.urlFor({ companyId, userId, type: entry.type });
        }
        return urls;
    }

    private digestMail(claimed: readonly ClaimedEntry[], first: ClaimedEntry, context: DigestContext): EnqueueMailRequest {
        const unsubscribeUrl: string = context.urls[first.entry.type] ?? '';
        return {
            template: this.types.require(first.entry.type).template,
            locale: context.recipient.locale,
            props: {
                ...context.extra,
                firstName: context.recipient.firstName,
                [DIGEST_ENTRIES_PROP]: JSON.stringify(claimed.map(({ entry }: ClaimedEntry) => ({ type: entry.type, ...entry.data }))),
                [DIGEST_UNSUBSCRIBE_PROP]: JSON.stringify(context.urls),
                unsubscribeUrl
            },
            to: { email: context.recipient.email, name: context.recipient.firstName },
            unsubscribeUrl,
            reference: `${first.entry.type}-${first.noticeId}`
        };
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
