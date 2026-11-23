import { registerAs } from '@nestjs/config';
import { z } from 'zod';

function blankAsUndefined(value: unknown): unknown {
    return typeof value === 'string' && value.trim().length === 0 ? undefined : value;
}

const DEFAULT_CODE_TTL_MINUTES: number = 10;
const DEFAULT_STALE_DAYS: number = 180;

const schema = z.object({
    WHATSAPP_LINK_CODE_TTL_MINUTES: z.preprocess(blankAsUndefined, z.coerce.number().int().positive().default(DEFAULT_CODE_TTL_MINUTES)),
    WHATSAPP_LINK_STALE_DAYS: z.preprocess(blankAsUndefined, z.coerce.number().int().positive().default(DEFAULT_STALE_DAYS)),
    WHATSAPP_PHONE_HMAC_KEY: z.preprocess(blankAsUndefined, z.string().trim().min(16).optional())
});

export interface WhatsAppLinkSettings {
    readonly WHATSAPP_LINK_CODE_TTL_MINUTES: number;
    readonly WHATSAPP_LINK_STALE_DAYS: number;
    readonly WHATSAPP_PHONE_HMAC_KEY: string | null;
}

export function parseWhatsAppLinkConfig(env: NodeJS.ProcessEnv): WhatsAppLinkSettings {
    const parsed: z.infer<typeof schema> = schema.parse(env);
    return {
        WHATSAPP_LINK_CODE_TTL_MINUTES: parsed.WHATSAPP_LINK_CODE_TTL_MINUTES,
        WHATSAPP_LINK_STALE_DAYS: parsed.WHATSAPP_LINK_STALE_DAYS,
        WHATSAPP_PHONE_HMAC_KEY: parsed.WHATSAPP_PHONE_HMAC_KEY ?? null
    };
}

export const whatsappLinkConfig = registerAs('whatsappLink', (): WhatsAppLinkSettings => parseWhatsAppLinkConfig(process.env));
