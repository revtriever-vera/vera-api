import { AppLocale } from '../../shared/i18n/locale';

export interface MailRecipient {
    readonly email: string;
    readonly name?: string;
}

export interface MailContent {
    readonly subject: string;
    readonly html: string;
    readonly text: string;
}

export interface MailSender {
    readonly name: string;
    readonly email?: string;
    readonly replyTo?: string;
}

export interface Mail extends MailContent {
    readonly to: MailRecipient;
    readonly sender?: MailSender;
    readonly locale?: AppLocale;
    readonly unsubscribeUrl?: string;
    readonly tags?: Readonly<Record<string, string>>;
}

export interface MailReceipt {
    readonly provider: string;
    readonly providerMessageId: string | null;
    readonly acceptedAt: Date;
}

export const SEND_OUTCOMES = {
    accepted: 'accepted',
    blockedByAllowlist: 'blocked_by_allowlist',
    failedWillRetry: 'failed_will_retry',
    gaveUp: 'gave_up',
    suppressed: 'suppressed',
    delivered: 'delivered',
    bounced: 'bounced',
    complained: 'complained'
} as const;

export type SendOutcome = (typeof SEND_OUTCOMES)[keyof typeof SEND_OUTCOMES];
