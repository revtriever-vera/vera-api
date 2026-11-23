import { InboundMessage, WhatsAppChannel } from '../domain/whatsapp.types';

export type { InboundMessage, WhatsAppChannel };

export abstract class InboundDispatchPort {
    public abstract handle(message: InboundMessage, channel: WhatsAppChannel): Promise<void>;
}
