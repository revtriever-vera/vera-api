import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { whatsappConfig } from '../config/whatsapp.config';
import { interactivePayloadOf } from '../domain/interactive';
import {
    InteractiveChoices,
    PhoneHealth,
    QualityRating,
    RemoteTemplate,
    RemoteTemplateStatus,
    SentMessage,
    TemplateDefinition,
    TemplateSend,
    WhatsAppChannel
} from '../domain/whatsapp.types';
import { WhatsAppCloudPort } from '../ports/whatsapp-cloud.port';
import {
    DisplayNumberResponse,
    HealthResponse,
    SendResponse,
    SubmitResponse,
    TemplateEntry,
    TemplatesResponse,
    displayNumberResponseSchema,
    healthResponseSchema,
    sendResponseSchema,
    submitResponseSchema,
    successSchema,
    templatesResponseSchema
} from '../validation/graph-responses.schemas';
import { GraphHttp } from './graph-http';

const PAGE_SIZE: string = '100';
const MAX_PAGES: number = 10;
const TEMPLATE_STATUS_VALUES: ReadonlySet<string> = new Set(['APPROVED', 'PENDING', 'IN_APPEAL', 'REJECTED', 'PAUSED', 'DISABLED']);
const QUALITY_VALUES: ReadonlySet<string> = new Set(['GREEN', 'YELLOW', 'RED']);
const UNKNOWN: string = 'UNKNOWN';

function nextCursorOf(next: string | undefined): string | undefined {
    if (next === undefined) {
        return undefined;
    }
    return new URL(next).searchParams.get('after') ?? undefined;
}

function remoteTemplateOf(entry: TemplateEntry): RemoteTemplate {
    return {
        name: entry.name,
        language: entry.language,
        status: remoteStatusOf(entry.status),
        remoteId: entry.id,
        rejectedReason: entry.rejected_reason ?? null
    };
}

function remoteStatusOf(status: string): RemoteTemplateStatus {
    return TEMPLATE_STATUS_VALUES.has(status) ? (status as RemoteTemplateStatus) : 'PENDING';
}

@Injectable()
export class CloudWhatsAppDriver extends WhatsAppCloudPort {
    private readonly http: GraphHttp;

    public constructor(@Inject(whatsappConfig.KEY) config: ConfigType<typeof whatsappConfig>) {
        super();
        this.http = new GraphHttp(config.WHATSAPP_GRAPH_BASE_URL, config.WHATSAPP_GRAPH_VERSION, config.WHATSAPP_HTTP_TIMEOUT_MS);
    }

    public async sendText(channel: WhatsAppChannel, to: string, body: string, replyTo?: string): Promise<SentMessage> {
        return this.send(channel, {
            to,
            type: 'text',
            text: { body, preview_url: false },
            ...(replyTo === undefined ? {} : { context: { message_id: replyTo } })
        });
    }

    public async sendTemplate(channel: WhatsAppChannel, to: string, template: TemplateSend): Promise<SentMessage> {
        return this.send(channel, {
            to,
            type: 'template',
            template: {
                name: template.name,
                language: { code: template.language },
                components: [{ type: 'body', parameters: template.variables.map((text: string) => ({ type: 'text', text })) }]
            }
        });
    }

    public async sendInteractive(channel: WhatsAppChannel, to: string, interactive: InteractiveChoices): Promise<SentMessage> {
        return this.send(channel, { to, type: 'interactive', interactive: interactivePayloadOf(interactive) });
    }

    public async listTemplates(channel: WhatsAppChannel): Promise<readonly RemoteTemplate[]> {
        const found: RemoteTemplate[] = [];
        let after: string | undefined;
        for (let page: number = 0; page < MAX_PAGES; page += 1) {
            const response: TemplatesResponse = await this.templatesPage(channel, after);
            found.push(...response.data.map(remoteTemplateOf));
            after = nextCursorOf(response.paging?.next);
            if (after === undefined) {
                break;
            }
        }
        return found;
    }

    public async submitTemplate(channel: WhatsAppChannel, template: TemplateDefinition): Promise<{ readonly remoteId: string }> {
        const response: SubmitResponse = await this.http.request(
            {
                method: 'POST',
                path: `${channel.wabaId ?? ''}/message_templates`,
                accessToken: channel.accessToken,
                body: {
                    name: template.name,
                    language: template.language,
                    category: template.category,
                    allow_category_change: false,
                    components: [{ type: 'BODY', text: template.body, example: { body_text: [template.examples] } }]
                }
            },
            submitResponseSchema
        );
        return { remoteId: response.id };
    }

    public async phoneHealth(channel: WhatsAppChannel): Promise<PhoneHealth> {
        const response: HealthResponse = await this.http.request(
            {
                method: 'GET',
                path: channel.phoneNumberId,
                accessToken: channel.accessToken,
                query: { fields: 'quality_rating,messaging_limit_tier,status' }
            },
            healthResponseSchema
        );
        const rating: string = response.quality_rating ?? UNKNOWN;
        return {
            qualityRating: (QUALITY_VALUES.has(rating) ? rating : UNKNOWN) as QualityRating,
            messagingLimitTier: response.messaging_limit_tier ?? null,
            status: response.status ?? UNKNOWN
        };
    }

    public async displayNumber(channel: WhatsAppChannel): Promise<string | null> {
        const response: DisplayNumberResponse = await this.http.request(
            {
                method: 'GET',
                path: channel.phoneNumberId,
                accessToken: channel.accessToken,
                query: { fields: 'display_phone_number' }
            },
            displayNumberResponseSchema
        );
        return response.display_phone_number ?? null;
    }

    public async markRead(channel: WhatsAppChannel, wamid: string): Promise<void> {
        await this.http.request(
            {
                method: 'POST',
                path: `${channel.phoneNumberId}/messages`,
                accessToken: channel.accessToken,
                body: { messaging_product: 'whatsapp', status: 'read', message_id: wamid }
            },
            successSchema
        );
    }

    private async templatesPage(channel: WhatsAppChannel, after: string | undefined): Promise<TemplatesResponse> {
        return this.http.request(
            {
                method: 'GET',
                path: `${channel.wabaId ?? ''}/message_templates`,
                accessToken: channel.accessToken,
                query: { fields: 'id,name,language,status,rejected_reason', limit: PAGE_SIZE, ...(after === undefined ? {} : { after }) }
            },
            templatesResponseSchema
        );
    }

    private async send(channel: WhatsAppChannel, message: Record<string, unknown>): Promise<SentMessage> {
        const response: SendResponse = await this.http.request(
            {
                method: 'POST',
                path: `${channel.phoneNumberId}/messages`,
                accessToken: channel.accessToken,
                body: { messaging_product: 'whatsapp', recipient_type: 'individual', ...message }
            },
            sendResponseSchema
        );
        return { wamid: response.messages[0]?.id ?? '' };
    }
}
