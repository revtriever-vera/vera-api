import { z } from 'zod';
import { isAllowedModelUrl } from '../domain/outbound-url';
import { INTEGRATION_KINDS } from '../domain/integration.types';

const SECRET_MIN_LENGTH: number = 8;
const SECRET_MAX_LENGTH: number = 512;
const TEXT_MAX_LENGTH: number = 256;
const PRINTABLE_WITHOUT_SPACE: RegExp = /^[\x21-\x7E]+$/;
const GOOGLE_CLIENT_ID_SUFFIX: RegExp = /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/;
const PHONE_NUMBER_ID: RegExp = /^\d{5,20}$/;
const MODEL_NAME: RegExp = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/;

const secret = (description: string): z.ZodString =>
    z.string().trim().min(SECRET_MIN_LENGTH).max(SECRET_MAX_LENGTH).regex(PRINTABLE_WITHOUT_SPACE).describe(description);

export const integrationKindSchema = z.enum(INTEGRATION_KINDS).describe('Integration kind: `llm`, `whatsapp` or `google`');

export const saveLlmSchema = z.object({
    baseUrl: z
        .string()
        .trim()
        .max(TEXT_MAX_LENGTH)
        .refine(isAllowedModelUrl)
        .describe('Base URL of an OpenAI-compatible API. `https`, or `http` only for localhost and private networks'),
    apiKey: secret('API key of the provider. Never returned by any route'),
    model: z.string().trim().min(1).max(TEXT_MAX_LENGTH).regex(MODEL_NAME).describe('Model name as the provider lists it')
});

export const saveWhatsAppSchema = z.object({
    accessToken: secret('Access token of the WhatsApp Cloud API. Never returned by any route'),
    phoneNumberId: z.string().trim().regex(PHONE_NUMBER_ID).describe('Phone number ID of the WhatsApp Business number, digits only'),
    verifyToken: secret('Token the webhook verification handshake compares. Never returned by any route'),
    appSecret: secret('App secret of the Meta app, used to validate the webhook signature. Never returned by any route')
});

export const saveGoogleSchema = z.object({
    clientId: z
        .string()
        .trim()
        .max(TEXT_MAX_LENGTH)
        .regex(GOOGLE_CLIENT_ID_SUFFIX)
        .describe('OAuth client ID, ends with `.apps.googleusercontent.com`'),
    clientSecret: secret('OAuth client secret. Never returned by any route')
});

export type SaveLlmBody = z.infer<typeof saveLlmSchema>;
export type SaveWhatsAppBody = z.infer<typeof saveWhatsAppSchema>;
export type SaveGoogleBody = z.infer<typeof saveGoogleSchema>;

const publicFieldsSchema = z.object({
    baseUrl: z.string().optional().describe('Base URL of the language model API'),
    model: z.string().optional().describe('Model name'),
    phoneNumberId: z.string().optional().describe('WhatsApp phone number ID'),
    clientId: z.string().optional().describe('Google OAuth client ID')
});

export const integrationItemSchema = z.object({
    kind: integrationKindSchema,
    configured: z.boolean().describe('Whether this installation has a key saved for the integration'),
    hint: z.string().nullable().describe('Last 4 characters of the key or token, null when not configured'),
    public: publicFieldsSchema.describe('Non secret fields saved with the key'),
    verifiedAt: z.string().nullable().describe('When the key last passed the test, ISO 8601')
});

export const integrationsViewSchema = z.object({
    items: z.array(integrationItemSchema).describe('One item per integration kind'),
    webhookUrl: z.string().describe('URL to register as the WhatsApp webhook'),
    googleRedirectUri: z.string().describe('Redirect URI to register in the Google OAuth client')
});

export const sealedPayloadSchemas = {
    llm: z.object({
        kind: z.literal('llm'),
        baseUrl: z.string(),
        apiKey: z.string(),
        model: z.string(),
        provider: z.enum(['gateway', 'openai_compatible'])
    }),
    whatsapp: z.object({
        kind: z.literal('whatsapp'),
        accessToken: z.string(),
        phoneNumberId: z.string(),
        verifyToken: z.string(),
        appSecret: z.string(),
        wabaId: z.string().nullable()
    }),
    google: z.object({ kind: z.literal('google'), clientId: z.string(), clientSecret: z.string() })
};

export const modelsListingSchema = z.object({ data: z.array(z.object({ id: z.string() })) });
