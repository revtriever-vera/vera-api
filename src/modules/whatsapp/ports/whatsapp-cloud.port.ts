import {
    InteractiveChoices,
    PhoneHealth,
    RemoteTemplate,
    SentMessage,
    TemplateDefinition,
    TemplateSend,
    WhatsAppChannel
} from '../domain/whatsapp.types';

export type GraphFailureKind = 'rate_limited' | 'transient' | 'recipient_invalid' | 'window_closed' | 'token_invalid' | 'rejected';

export class WhatsAppGraphError extends Error {
    public constructor(
        public readonly kind: GraphFailureKind,
        public readonly errorCode: string,
        public readonly httpStatus: number | null
    ) {
        super(`whatsapp_graph:${kind}:${errorCode}`);
        this.name = 'WhatsAppGraphError';
    }
}

export abstract class WhatsAppCloudPort {
    public abstract sendText(channel: WhatsAppChannel, to: string, body: string, replyTo?: string): Promise<SentMessage>;
    public abstract sendTemplate(channel: WhatsAppChannel, to: string, template: TemplateSend): Promise<SentMessage>;
    public abstract sendInteractive(channel: WhatsAppChannel, to: string, interactive: InteractiveChoices): Promise<SentMessage>;
    public abstract listTemplates(channel: WhatsAppChannel): Promise<readonly RemoteTemplate[]>;
    public abstract submitTemplate(channel: WhatsAppChannel, template: TemplateDefinition): Promise<{ readonly remoteId: string }>;
    public abstract phoneHealth(channel: WhatsAppChannel): Promise<PhoneHealth>;
    public abstract markRead(channel: WhatsAppChannel, wamid: string): Promise<void>;
}
