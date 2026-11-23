import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { integrationCredentialsConfig } from '../config/integration-credentials.config';
import { IntegrationCredentialsByKind, IntegrationKind, LlmProvider } from '../domain/integration.types';

type Settings = ConfigType<typeof integrationCredentialsConfig>;
type Reader = { [K in IntegrationKind]: (provider: LlmProvider) => IntegrationCredentialsByKind[K] | null };

@Injectable()
export class InstanceCredentialsService {
    private readonly readers: Reader = {
        llm: (provider: LlmProvider) => this.llm(provider),
        whatsapp: () => this.whatsapp(),
        google: () => this.google()
    };

    public constructor(@Inject(integrationCredentialsConfig.KEY) private readonly config: Settings) {}

    public of<K extends IntegrationKind>(kind: K, provider: LlmProvider): IntegrationCredentialsByKind[K] | null {
        return this.readers[kind](provider);
    }

    private llm(provider: LlmProvider): IntegrationCredentialsByKind['llm'] | null {
        const { LLM_MODEL: model } = this.config;
        if (model === undefined) {
            return null;
        }
        if (provider === 'gateway') {
            const apiKey: string | undefined = this.config.AI_GATEWAY_API_KEY;
            return apiKey === undefined ? null : { kind: 'llm', baseUrl: this.config.AI_GATEWAY_BASE_URL, apiKey, model, provider };
        }
        const { LLM_BASE_URL: baseUrl, LLM_API_KEY: apiKey } = this.config;
        return baseUrl === undefined || apiKey === undefined ? null : { kind: 'llm', baseUrl, apiKey, model, provider };
    }

    private whatsapp(): IntegrationCredentialsByKind['whatsapp'] | null {
        const accessToken: string | undefined = this.config.WHATSAPP_ACCESS_TOKEN;
        const phoneNumberId: string | undefined = this.config.WHATSAPP_PHONE_NUMBER_ID;
        const verifyToken: string | undefined = this.config.WHATSAPP_VERIFY_TOKEN;
        const appSecret: string | undefined = this.config.WHATSAPP_APP_SECRET;
        if (accessToken === undefined || phoneNumberId === undefined || verifyToken === undefined || appSecret === undefined) {
            return null;
        }
        return { kind: 'whatsapp', accessToken, phoneNumberId, verifyToken, appSecret, wabaId: this.config.WHATSAPP_WABA_ID ?? null };
    }

    private google(): IntegrationCredentialsByKind['google'] | null {
        const clientId: string | undefined = this.config.GOOGLE_OAUTH_CLIENT_ID;
        const clientSecret: string | undefined = this.config.GOOGLE_OAUTH_CLIENT_SECRET;
        return clientId === undefined || clientSecret === undefined ? null : { kind: 'google', clientId, clientSecret };
    }
}
