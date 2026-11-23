import {
    InteractiveChoices,
    PhoneHealth,
    RemoteTemplate,
    SentMessage,
    TemplateDefinition,
    TemplateSend,
    WhatsAppChannel
} from '../domain/whatsapp.types';
import { WhatsAppCloudPort, WhatsAppGraphError } from '../ports/whatsapp-cloud.port';
import { WhatsAppLogService } from '../services/whatsapp-log.service';
import { WhatsAppMetricsService } from '../services/whatsapp-metrics.service';

export class ObservedWhatsApp extends WhatsAppCloudPort {
    public constructor(
        private readonly inner: WhatsAppCloudPort,
        private readonly logs: WhatsAppLogService,
        private readonly metrics: WhatsAppMetricsService
    ) {
        super();
    }

    public async sendText(channel: WhatsAppChannel, to: string, body: string, replyTo?: string): Promise<SentMessage> {
        return this.track('text', null, async () => this.inner.sendText(channel, to, body, replyTo));
    }

    public async sendTemplate(channel: WhatsAppChannel, to: string, template: TemplateSend): Promise<SentMessage> {
        return this.track('template', template.name, async () => this.inner.sendTemplate(channel, to, template));
    }

    public async sendInteractive(channel: WhatsAppChannel, to: string, interactive: InteractiveChoices): Promise<SentMessage> {
        return this.track('interactive', null, async () => this.inner.sendInteractive(channel, to, interactive));
    }

    public async listTemplates(channel: WhatsAppChannel): Promise<readonly RemoteTemplate[]> {
        return this.inner.listTemplates(channel);
    }

    public async submitTemplate(channel: WhatsAppChannel, template: TemplateDefinition): Promise<{ readonly remoteId: string }> {
        return this.inner.submitTemplate(channel, template);
    }

    public async phoneHealth(channel: WhatsAppChannel): Promise<PhoneHealth> {
        return this.inner.phoneHealth(channel);
    }

    public async displayNumber(channel: WhatsAppChannel): Promise<string | null> {
        return this.inner.displayNumber(channel);
    }

    public async markRead(channel: WhatsAppChannel, wamid: string): Promise<void> {
        await this.inner.markRead(channel, wamid);
    }

    private async track(kind: string, template: string | null, call: () => Promise<SentMessage>): Promise<SentMessage> {
        const startedAt: number = Date.now();
        try {
            const sent: SentMessage = await call();
            this.logs.send({ kind, template, outcome: 'sent', errorCode: null });
            return sent;
        } catch (error: unknown) {
            const failure: WhatsAppGraphError | null = error instanceof WhatsAppGraphError ? error : null;
            this.logs.send({ kind, template, outcome: failure?.kind ?? 'unexpected', errorCode: failure?.errorCode ?? null });
            throw error;
        } finally {
            this.metrics.sendDuration(Date.now() - startedAt);
        }
    }
}
