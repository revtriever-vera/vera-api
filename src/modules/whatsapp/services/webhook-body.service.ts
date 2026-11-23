import { Injectable } from '@nestjs/common';
import { SafeParseReturnType, z } from 'zod';
import { WebhookBody, channelProbeSchema, webhookBodySchema } from '../validation/whatsapp-webhook.schemas';

@Injectable()
export class WebhookBodyService {
    public phoneNumberIds(rawBody: string): string[] {
        const json: unknown = this.json(rawBody);
        const probe: SafeParseReturnType<unknown, z.infer<typeof channelProbeSchema>> = channelProbeSchema.safeParse(json);
        if (!probe.success) {
            return [];
        }
        return [...new Set(probe.data.entry.flatMap((entry) => entry.changes.map((change) => change.value.metadata.phone_number_id)))];
    }

    public parse(rawBody: string): WebhookBody | null {
        const parsed: SafeParseReturnType<unknown, WebhookBody> = webhookBodySchema.safeParse(this.json(rawBody));
        return parsed.success ? parsed.data : null;
    }

    private json(rawBody: string): unknown {
        try {
            return JSON.parse(rawBody);
        } catch {
            return null;
        }
    }
}
