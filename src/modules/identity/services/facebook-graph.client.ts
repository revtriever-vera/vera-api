import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';
import { authConfig } from '../config/auth.config';
import { InvalidFacebookTokenError, ProviderUnavailableError } from '../domain/identity.errors';
import { LOGIN_PROVIDERS } from '../domain/identity.types';
import {
    DebugTokenResponse,
    debugTokenSchema,
    GraphErrorResponse,
    graphErrorSchema,
    ProfileResponse,
    profileSchema
} from '../validation/facebook-graph.schemas';

const GRAPH_ORIGIN: string = 'https://graph.facebook.com';
const REQUEST_TIMEOUT_MS: number = 5000;
const SERVER_ERROR_FLOOR: number = 500;
const TRANSIENT_GRAPH_CODES: readonly number[] = [1, 2, 4, 17, 32, 613];

export interface FacebookTokenInfo {
    readonly isValid: boolean;
    readonly appId: string | null;
    readonly type: string | null;
    readonly userId: string | null;
}

export interface FacebookProfile {
    readonly id: string;
    readonly name: string | null;
    readonly email: string | null;
}

@Injectable()
export class FacebookGraphClient {
    public constructor(@Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>) {}

    public async debugToken(inputToken: string): Promise<FacebookTokenInfo> {
        const body: unknown = await this.get('/debug_token', {
            input_token: inputToken,
            access_token: `${this.config.FACEBOOK_APP_ID}|${this.config.FACEBOOK_APP_SECRET}`
        });
        const parsed: z.SafeParseReturnType<unknown, DebugTokenResponse> = debugTokenSchema.safeParse(body);
        if (!parsed.success) {
            throw new InvalidFacebookTokenError();
        }
        const data: DebugTokenResponse['data'] = parsed.data.data;
        return {
            isValid: data.is_valid === true,
            appId: data.app_id ?? null,
            type: data.type ?? null,
            userId: data.user_id ?? null
        };
    }

    public async profile(accessToken: string, appSecretProof: string): Promise<FacebookProfile> {
        const body: unknown = await this.get('/me', {
            fields: 'id,name,email',
            access_token: accessToken,
            appsecret_proof: appSecretProof
        });
        const parsed: z.SafeParseReturnType<unknown, ProfileResponse> = profileSchema.safeParse(body);
        if (!parsed.success) {
            throw new InvalidFacebookTokenError();
        }
        return { id: parsed.data.id, name: parsed.data.name ?? null, email: parsed.data.email ?? null };
    }

    private async get(path: string, params: Readonly<Record<string, string>>): Promise<unknown> {
        const url: URL = new URL(`${GRAPH_ORIGIN}/${this.config.FACEBOOK_GRAPH_VERSION}${path}`);
        url.search = new URLSearchParams(params).toString();
        const response: Response = await this.fetchOrUnavailable(url);
        const body: unknown = await response.json().catch((): unknown => null);
        if (response.ok) {
            return body;
        }
        if (response.status >= SERVER_ERROR_FLOOR || this.isTransient(body)) {
            throw new ProviderUnavailableError(LOGIN_PROVIDERS.facebook);
        }
        throw new InvalidFacebookTokenError();
    }

    private async fetchOrUnavailable(url: URL): Promise<Response> {
        try {
            return await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        } catch {
            throw new ProviderUnavailableError(LOGIN_PROVIDERS.facebook);
        }
    }

    private isTransient(body: unknown): boolean {
        const parsed: z.SafeParseReturnType<unknown, GraphErrorResponse> = graphErrorSchema.safeParse(body);
        return parsed.success && parsed.data.error.code !== undefined && TRANSIENT_GRAPH_CODES.includes(parsed.data.error.code);
    }
}
