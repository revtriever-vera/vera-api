import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { stripTrailing } from '../../../shared/utils/strip-trailing';

function blankAsUndefined(value: unknown): unknown {
    return typeof value === 'string' && value.trim().length === 0 ? undefined : value;
}

const DEFAULT_BASE_URL: string = 'https://graph.facebook.com';
const DEFAULT_GRAPH_VERSION: string = 'v21.0';
const DEFAULT_TIMEOUT_MS: number = 10_000;
const DEFAULT_RETENTION_DAYS: number = 30;
const MAX_RETENTION_DAYS: number = 365;
const ANY_RECIPIENT: string = '*';

function flag(fallback: 'true' | 'false'): z.ZodType<'true' | 'false', z.ZodTypeDef, unknown> {
    return z.preprocess(blankAsUndefined, z.enum(['true', 'false']).default(fallback));
}

const schema = z.object({
    WHATSAPP_DRIVER: z.preprocess(blankAsUndefined, z.enum(['cloud', 'mock']).optional()),
    WHATSAPP_GRAPH_BASE_URL: z.preprocess(blankAsUndefined, z.string().trim().url().default(DEFAULT_BASE_URL)),
    WHATSAPP_GRAPH_VERSION: z.preprocess(
        blankAsUndefined,
        z
            .string()
            .trim()
            .regex(/^v\d+\.\d+$/)
            .default(DEFAULT_GRAPH_VERSION)
    ),
    WHATSAPP_HTTP_TIMEOUT_MS: z.preprocess(blankAsUndefined, z.coerce.number().int().positive().default(DEFAULT_TIMEOUT_MS)),
    WHATSAPP_ALLOWED_RECIPIENTS: z.preprocess(blankAsUndefined, z.string().trim().default(ANY_RECIPIENT)),
    WHATSAPP_TEMPLATES_AUTO_SUBMIT: flag('true'),
    WHATSAPP_TEXT_RETENTION_DAYS: z.preprocess(
        blankAsUndefined,
        z.coerce.number().int().positive().max(MAX_RETENTION_DAYS).default(DEFAULT_RETENTION_DAYS)
    ),
    WHATSAPP_DISPLAY_NUMBER: z.preprocess(blankAsUndefined, z.string().trim().optional())
});

export interface WhatsAppSettings {
    /** Fora do local nunca é `mock`. */
    readonly WHATSAPP_DRIVER: 'cloud' | 'mock';
    readonly WHATSAPP_GRAPH_BASE_URL: string;
    readonly WHATSAPP_GRAPH_VERSION: string;
    readonly WHATSAPP_HTTP_TIMEOUT_MS: number;
    readonly WHATSAPP_ALLOWED_RECIPIENTS: readonly string[];
    readonly WHATSAPP_TEMPLATES_AUTO_SUBMIT: boolean;
    readonly WHATSAPP_TEXT_RETENTION_DAYS: number;
    readonly WHATSAPP_DISPLAY_NUMBER: string | null;
    readonly WHATSAPP_DEV_ROUTES: boolean;
}

export function digitsOf(value: string): string {
    return value.replaceAll(/\D/g, '');
}

function recipientsOf(raw: string): string[] {
    if (raw === ANY_RECIPIENT) {
        return [ANY_RECIPIENT];
    }
    return raw
        .split(',')
        .map(digitsOf)
        .filter((entry: string): boolean => entry.length > 0);
}

export function parseWhatsAppConfig(env: NodeJS.ProcessEnv): WhatsAppSettings {
    const parsed: z.infer<typeof schema> = schema.parse(env);
    const isLocal: boolean = env['IS_LOCAL'] === 'true';
    const driver: 'cloud' | 'mock' = isLocal ? (parsed.WHATSAPP_DRIVER ?? 'mock') : 'cloud';
    return {
        WHATSAPP_DRIVER: driver,
        WHATSAPP_GRAPH_BASE_URL: stripTrailing(parsed.WHATSAPP_GRAPH_BASE_URL, '/'),
        WHATSAPP_GRAPH_VERSION: parsed.WHATSAPP_GRAPH_VERSION,
        WHATSAPP_HTTP_TIMEOUT_MS: parsed.WHATSAPP_HTTP_TIMEOUT_MS,
        WHATSAPP_ALLOWED_RECIPIENTS: recipientsOf(parsed.WHATSAPP_ALLOWED_RECIPIENTS),
        WHATSAPP_TEMPLATES_AUTO_SUBMIT: parsed.WHATSAPP_TEMPLATES_AUTO_SUBMIT === 'true',
        WHATSAPP_TEXT_RETENTION_DAYS: parsed.WHATSAPP_TEXT_RETENTION_DAYS,
        WHATSAPP_DISPLAY_NUMBER: parsed.WHATSAPP_DISPLAY_NUMBER ?? null,
        WHATSAPP_DEV_ROUTES: isLocal && driver === 'mock'
    };
}

export const whatsappConfig = registerAs('whatsapp', (): WhatsAppSettings => parseWhatsAppConfig(process.env));
