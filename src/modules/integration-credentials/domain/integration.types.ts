import { Insertable, Selectable } from 'kysely';
import { IntegrationCredentials } from '../../../core/database/generated/database.types';

export type IntegrationCredential = Selectable<IntegrationCredentials>;
export type NewIntegrationCredential = Insertable<IntegrationCredentials>;

export const INTEGRATION_KINDS = ['llm', 'whatsapp', 'google'] as const;

export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

export const INTEGRATION_CREDENTIALS_PURPOSE: string = 'integration-credentials';
export const HINT_LENGTH: number = 4;

export const TEST_FAILURE_REASONS = {
    unauthorized: 'unauthorized',
    notFound: 'not_found',
    unreachable: 'unreachable',
    invalidModel: 'invalid_model'
} as const;

export type TestFailureReason = (typeof TEST_FAILURE_REASONS)[keyof typeof TEST_FAILURE_REASONS];

export type LlmProvider = 'gateway' | 'openai_compatible';

export type LlmCredentials = {
    kind: 'llm';
    baseUrl: string;
    apiKey: string;
    model: string;
    provider: LlmProvider;
};

export type WhatsAppCredentials = {
    kind: 'whatsapp';
    accessToken: string;
    phoneNumberId: string;
    verifyToken: string;
    appSecret: string;
    wabaId: string | null;
};

export type TenantWhatsAppCredentials = {
    companyId: string;
    credentials: WhatsAppCredentials;
};

export type GoogleCredentials = {
    kind: 'google';
    clientId: string;
    clientSecret: string;
};

export type IntegrationCredentialsByKind = {
    llm: LlmCredentials;
    whatsapp: WhatsAppCredentials;
    google: GoogleCredentials;
};

export type IntegrationPublicFields = {
    baseUrl?: string;
    model?: string;
    phoneNumberId?: string;
    clientId?: string;
};

export type IntegrationItem = {
    kind: IntegrationKind;
    configured: boolean;
    hint: string | null;
    public: IntegrationPublicFields;
    verifiedAt: string | null;
};

export type IntegrationsView = {
    items: IntegrationItem[];
    webhookUrl: string;
    googleRedirectUri: string;
};

export type SealedIntegration = {
    kind: IntegrationKind;
    sealed: string;
    sealerDriver: string;
    hint: string;
    baseUrl: string | null;
    model: string | null;
    phoneNumberId: string | null;
    clientId: string | null;
};

export type KindCount = {
    kind: string;
    total: number;
};
