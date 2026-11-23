import { Injectable } from '@nestjs/common';
import { IdUtil } from '../../../shared/utils/id.util';
import {
    InteractiveChoices,
    PhoneHealth,
    RemoteTemplate,
    SentMessage,
    TemplateDefinition,
    TemplateSend,
    WhatsAppChannel
} from '../domain/whatsapp.types';
import { WhatsAppCloudPort } from '../ports/whatsapp-cloud.port';
import { MockOutbox } from '../services/mock-outbox.service';

const REFUSED_WORDS: RegExp = /desconto|promo|oferta/i;

@Injectable()
export class MockWhatsAppDriver extends WhatsAppCloudPort {
    private readonly templates: Map<string, RemoteTemplate[]> = new Map<string, RemoteTemplate[]>();

    public constructor(private readonly outbox: MockOutbox) {
        super();
    }

    public sendText(_channel: WhatsAppChannel, to: string, body: string): Promise<SentMessage> {
        return Promise.resolve(this.sent(to, 'text', body));
    }

    public sendTemplate(_channel: WhatsAppChannel, to: string, template: TemplateSend): Promise<SentMessage> {
        return Promise.resolve(this.sent(to, 'template', `${template.name}:${template.variables.join('|')}`));
    }

    public sendInteractive(_channel: WhatsAppChannel, to: string, interactive: InteractiveChoices): Promise<SentMessage> {
        return Promise.resolve(this.sent(to, 'interactive', interactive.body));
    }

    public listTemplates(channel: WhatsAppChannel): Promise<readonly RemoteTemplate[]> {
        return Promise.resolve([...(this.templates.get(channel.phoneNumberId) ?? [])]);
    }

    public submitTemplate(channel: WhatsAppChannel, template: TemplateDefinition): Promise<{ readonly remoteId: string }> {
        const remoteId: string = `mock-template-${IdUtil.newId()}`;
        const refused: boolean = REFUSED_WORDS.test(template.body);
        const entry: RemoteTemplate = {
            name: template.name,
            language: template.language,
            status: refused ? 'REJECTED' : 'APPROVED',
            remoteId,
            rejectedReason: refused ? 'INVALID_FORMAT' : null
        };
        this.templates.set(channel.phoneNumberId, [...(this.templates.get(channel.phoneNumberId) ?? []), entry]);
        return Promise.resolve({ remoteId });
    }

    public phoneHealth(): Promise<PhoneHealth> {
        return Promise.resolve({ qualityRating: 'GREEN', messagingLimitTier: 'TIER_1K', status: 'CONNECTED' });
    }

    public markRead(): Promise<void> {
        return Promise.resolve();
    }

    private sent(to: string, kind: 'text' | 'template' | 'interactive', body: string): SentMessage {
        const wamid: string = `wamid.mock.${IdUtil.newId()}`;
        this.outbox.record({ to, kind, wamid, body });
        return { wamid };
    }
}
