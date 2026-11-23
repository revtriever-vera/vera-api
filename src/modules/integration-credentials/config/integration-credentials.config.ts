import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { stripTrailing } from '../../../shared/utils/strip-trailing';

function blankAsUndefined(value: unknown): unknown {
    return typeof value === 'string' && value.trim().length === 0 ? undefined : value;
}

const DEFAULT_PUBLIC_API_URL: string = 'http://localhost:3333';
const DEFAULT_GATEWAY_URL: string = 'https://ai-gateway.vercel.sh/v1';
const DEFAULT_GRAPH_URL: string = 'https://graph.facebook.com/v21.0';
const DEFAULT_TEST_TIMEOUT_MS: number = 10_000;

const optionalText = z.preprocess(blankAsUndefined, z.string().trim().optional());
const optionalUrl = z.preprocess(blankAsUndefined, z.string().trim().url().optional());
const flag = z.preprocess(blankAsUndefined, z.enum(['true', 'false']).default('false'));

const schema = z.object({
    INTEGRATIONS_INSTANCE_FALLBACK: flag,
    INTEGRATIONS_TEST_TIMEOUT_MS: z.preprocess(blankAsUndefined, z.coerce.number().int().positive().default(DEFAULT_TEST_TIMEOUT_MS)),
    PUBLIC_API_URL: z.preprocess(blankAsUndefined, z.string().trim().url().default(DEFAULT_PUBLIC_API_URL)),
    WHATSAPP_GRAPH_URL: z.preprocess(blankAsUndefined, z.string().trim().url().default(DEFAULT_GRAPH_URL)),
    AI_GATEWAY_API_KEY: optionalText,
    AI_GATEWAY_BASE_URL: z.preprocess(blankAsUndefined, z.string().trim().url().default(DEFAULT_GATEWAY_URL)),
    LLM_BASE_URL: optionalUrl,
    LLM_API_KEY: optionalText,
    LLM_MODEL: optionalText,
    WHATSAPP_ACCESS_TOKEN: optionalText,
    WHATSAPP_PHONE_NUMBER_ID: optionalText,
    WHATSAPP_VERIFY_TOKEN: optionalText,
    WHATSAPP_APP_SECRET: optionalText,
    WHATSAPP_WABA_ID: optionalText,
    GOOGLE_OAUTH_CLIENT_ID: optionalText,
    GOOGLE_OAUTH_CLIENT_SECRET: optionalText
});

export interface IntegrationCredentialsSettings {
    readonly INTEGRATIONS_INSTANCE_FALLBACK: boolean;
    readonly INTEGRATIONS_TEST_TIMEOUT_MS: number;
    readonly PUBLIC_API_URL: string;
    readonly WHATSAPP_GRAPH_URL: string;
    readonly AI_GATEWAY_API_KEY?: string;
    readonly AI_GATEWAY_BASE_URL: string;
    readonly LLM_BASE_URL?: string;
    readonly LLM_API_KEY?: string;
    readonly LLM_MODEL?: string;
    readonly WHATSAPP_ACCESS_TOKEN?: string;
    readonly WHATSAPP_PHONE_NUMBER_ID?: string;
    readonly WHATSAPP_VERIFY_TOKEN?: string;
    readonly WHATSAPP_APP_SECRET?: string;
    readonly WHATSAPP_WABA_ID?: string;
    readonly GOOGLE_OAUTH_CLIENT_ID?: string;
    readonly GOOGLE_OAUTH_CLIENT_SECRET?: string;
}

export function parseIntegrationCredentialsConfig(env: NodeJS.ProcessEnv): IntegrationCredentialsSettings {
    const parsed: z.infer<typeof schema> = schema.parse(env);
    return {
        ...parsed,
        INTEGRATIONS_INSTANCE_FALLBACK: parsed.INTEGRATIONS_INSTANCE_FALLBACK === 'true',
        PUBLIC_API_URL: stripTrailing(parsed.PUBLIC_API_URL, '/'),
        WHATSAPP_GRAPH_URL: stripTrailing(parsed.WHATSAPP_GRAPH_URL, '/'),
        AI_GATEWAY_BASE_URL: stripTrailing(parsed.AI_GATEWAY_BASE_URL, '/')
    };
}

export const integrationCredentialsConfig = registerAs('integrationCredentials', (): IntegrationCredentialsSettings =>
    parseIntegrationCredentialsConfig(process.env)
);
