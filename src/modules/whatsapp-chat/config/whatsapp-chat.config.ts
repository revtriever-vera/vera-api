import { registerAs } from '@nestjs/config';
import { z } from 'zod';

function blankAsUndefined(value: unknown): unknown {
    return typeof value === 'string' && value.trim().length === 0 ? undefined : value;
}

const DEFAULT_LIMIT_MINUTE: number = 10;
const DEFAULT_LIMIT_DAY: number = 200;
const DEFAULT_COALESCE_MS: number = 2500;

const schema = z.object({
    WHATSAPP_CHAT_LIMIT_MINUTE: z.preprocess(blankAsUndefined, z.coerce.number().int().positive().default(DEFAULT_LIMIT_MINUTE)),
    WHATSAPP_CHAT_LIMIT_DAY: z.preprocess(blankAsUndefined, z.coerce.number().int().positive().default(DEFAULT_LIMIT_DAY)),
    WHATSAPP_CHAT_COALESCE_MS: z.preprocess(blankAsUndefined, z.coerce.number().int().min(0).default(DEFAULT_COALESCE_MS))
});

export interface WhatsAppChatSettings {
    readonly WHATSAPP_CHAT_LIMIT_MINUTE: number;
    readonly WHATSAPP_CHAT_LIMIT_DAY: number;
    readonly WHATSAPP_CHAT_COALESCE_MS: number;
}

export function parseWhatsAppChatConfig(env: NodeJS.ProcessEnv): WhatsAppChatSettings {
    const parsed: z.infer<typeof schema> = schema.parse(env);
    return {
        WHATSAPP_CHAT_LIMIT_MINUTE: parsed.WHATSAPP_CHAT_LIMIT_MINUTE,
        WHATSAPP_CHAT_LIMIT_DAY: parsed.WHATSAPP_CHAT_LIMIT_DAY,
        WHATSAPP_CHAT_COALESCE_MS: parsed.WHATSAPP_CHAT_COALESCE_MS
    };
}

export const whatsappChatConfig = registerAs('whatsappChat', (): WhatsAppChatSettings => parseWhatsAppChatConfig(process.env));
