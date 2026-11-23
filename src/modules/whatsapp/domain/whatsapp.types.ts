import { Insertable, Selectable } from 'kysely';
import {
    WhatsAppHealth,
    WhatsAppMessages,
    WhatsAppTemplateRegistrations,
    WhatsAppWebhookEvents
} from '../../../core/database/generated/database.types';

export type WebhookEvent = Selectable<WhatsAppWebhookEvents>;
export type WhatsAppMessage = Selectable<WhatsAppMessages>;
export type NewWhatsAppMessage = Insertable<WhatsAppMessages>;
export type TemplateRegistration = Selectable<WhatsAppTemplateRegistrations>;
export type ChannelHealth = Selectable<WhatsAppHealth>;

export const WEBHOOK_EVENT_STATUSES = {
    received: 'received',
    processed: 'processed',
    rejected: 'rejected',
    invalid: 'invalid',
    failed: 'failed'
} as const;

export type WebhookEventStatus = (typeof WEBHOOK_EVENT_STATUSES)[keyof typeof WEBHOOK_EVENT_STATUSES];

export const MESSAGE_STATUSES = {
    queued: 'queued',
    sending: 'sending',
    sent: 'sent',
    delivered: 'delivered',
    read: 'read',
    failed: 'failed',
    blocked: 'blocked',
    received: 'received'
} as const;

export type MessageStatus = (typeof MESSAGE_STATUSES)[keyof typeof MESSAGE_STATUSES];

export const MESSAGE_KINDS = {
    text: 'text',
    template: 'template',
    interactive: 'interactive',
    button: 'button',
    unsupported: 'unsupported'
} as const;

export type MessageKind = (typeof MESSAGE_KINDS)[keyof typeof MESSAGE_KINDS];

export const TEMPLATE_STATUSES = {
    submitted: 'submitted',
    approved: 'approved',
    rejected: 'rejected',
    paused: 'paused'
} as const;

export type TemplateStatus = (typeof TEMPLATE_STATUSES)[keyof typeof TEMPLATE_STATUSES];

export const HOSTED_CHANNEL_KEY: string = 'hosted';

export type WhatsAppChannel = {
    readonly phoneNumberId: string;
    readonly wabaId: string | null;
    readonly accessToken: string;
    readonly appSecret: string;
    readonly verifyToken: string;
    readonly displayNumber: string | null;
    readonly companyId: string | null;
};

export type TemplateLanguage = 'pt_BR' | 'en';

export type TemplateSend = {
    readonly name: string;
    readonly language: TemplateLanguage;
    readonly variables: readonly string[];
};

export type TemplateDefinition = {
    readonly name: string;
    readonly language: TemplateLanguage;
    readonly category: 'UTILITY';
    readonly body: string;
    readonly examples: readonly string[];
};

export type RemoteTemplateStatus = 'APPROVED' | 'PENDING' | 'IN_APPEAL' | 'REJECTED' | 'PAUSED' | 'DISABLED';

export type RemoteTemplate = {
    readonly name: string;
    readonly language: string;
    readonly status: RemoteTemplateStatus;
    readonly remoteId: string;
    readonly rejectedReason: string | null;
};

export type SentMessage = { readonly wamid: string };

export type InteractiveChoice = { readonly id: string; readonly title: string };

export type InteractiveChoices = { readonly body: string; readonly choices: readonly InteractiveChoice[] };

export type QualityRating = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';

export type PhoneHealth = {
    readonly qualityRating: QualityRating;
    readonly messagingLimitTier: string | null;
    readonly status: string;
};

export type InboundKind = 'text' | 'button' | 'unsupported';

export type InboundMessage = {
    readonly wamid: string;
    readonly from: string;
    readonly phoneNumberId: string;
    readonly kind: InboundKind;
    readonly text?: string;
    readonly buttonPayload?: string;
    readonly contextWamid?: string;
    readonly timestamp: Date;
};

export type StatusUpdate = {
    readonly wamid: string;
    readonly status: 'sent' | 'delivered' | 'read' | 'failed';
    readonly pricingCategory: string | null;
    readonly billable: boolean | null;
    readonly errorCode: string | null;
    readonly timestamp: Date;
};

export type WebhookReceivedPayload = { readonly eventId: string };
export type InboundReceivedPayload = { readonly eventId: string; readonly wamid: string };
export type StatusReceivedPayload = { readonly eventId: string; readonly wamid: string; readonly status: StatusUpdate['status'] };
export type SendRequestedPayload = { readonly messageId: string };

export type OutboundPayload =
    | { readonly template: { readonly language: TemplateLanguage; readonly variables: readonly string[] } }
    | { readonly choices: readonly InteractiveChoice[] };

export const SEND_ATTEMPTS: number = 3;
export const SEND_BACKOFF_MS: number = 5000;
export const WEBHOOK_BODY_LIMIT_BYTES: number = 3 * 1024 * 1024;
export const WINDOW_HOURS: number = 24;
export const EVENT_RETENTION_DAYS: number = 7;
export const RETENTION_BATCH: number = 500;
