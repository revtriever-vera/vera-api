import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, JWTVerifyGetKey } from 'jose';
import { googleCalendarConfig } from '../config/google-calendar.config';
import { CalendarProviderUnavailableError, CalendarTokenRevokedError } from '../domain/calendar.errors';
import { CalendarGrant, ClientCredentials, CodeExchange } from '../domain/calendar.types';
import { GoogleTokenResponse, errorResponseSchema, tokenResponseSchema } from './google-api.schemas';

const TOKEN_ENDPOINT: string = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT: string = 'https://oauth2.googleapis.com/revoke';
const CERTS_URL: string = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS: readonly string[] = ['https://accounts.google.com', 'accounts.google.com'];
const REVOKED_ERRORS: ReadonlySet<string> = new Set(['invalid_grant', 'invalid_token']);

@Injectable()
export class GoogleOAuthHttp {
    private readonly keys: JWTVerifyGetKey = createRemoteJWKSet(new URL(CERTS_URL));

    public constructor(@Inject(googleCalendarConfig.KEY) private readonly config: ConfigType<typeof googleCalendarConfig>) {}

    public async exchange(input: CodeExchange): Promise<CalendarGrant> {
        const response: GoogleTokenResponse = await this.token({
            grant_type: 'authorization_code',
            code: input.code,
            code_verifier: input.codeVerifier,
            client_id: input.credentials.clientId,
            client_secret: input.credentials.clientSecret,
            redirect_uri: input.credentials.redirectUri
        });
        return {
            refreshToken: response.refresh_token ?? null,
            scopes: (response.scope ?? '').split(' ').filter((scope: string): boolean => scope !== ''),
            email: await this.emailOf(response.id_token, input.credentials)
        };
    }

    public async accessToken(refreshToken: string, credentials: ClientCredentials): Promise<string> {
        const response: GoogleTokenResponse = await this.token({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret
        });
        if (response.access_token === undefined) {
            throw new CalendarProviderUnavailableError();
        }
        return response.access_token;
    }

    public async revoke(token: string): Promise<void> {
        const response: Response = await this.post(REVOKE_ENDPOINT, { token });
        if (!response.ok) {
            throw new CalendarProviderUnavailableError();
        }
    }

    private async token(form: Record<string, string>): Promise<GoogleTokenResponse> {
        const response: Response = await this.post(TOKEN_ENDPOINT, form);
        const body: unknown = await response.json().catch((): unknown => ({}));
        if (!response.ok) {
            const error: string | undefined = errorResponseSchema.safeParse(body).data?.error;
            throw error !== undefined && REVOKED_ERRORS.has(error)
                ? new CalendarTokenRevokedError()
                : new CalendarProviderUnavailableError();
        }
        const parsed: ReturnType<typeof tokenResponseSchema.safeParse> = tokenResponseSchema.safeParse(body);
        if (!parsed.success) {
            throw new CalendarProviderUnavailableError();
        }
        return parsed.data;
    }

    private async post(url: string, form: Record<string, string>): Promise<Response> {
        try {
            return await fetch(url, {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams(form).toString(),
                signal: AbortSignal.timeout(this.config.GOOGLE_CALENDAR_TIMEOUT_MS)
            });
        } catch (error: unknown) {
            throw new CalendarProviderUnavailableError(error);
        }
    }

    private async emailOf(idToken: string | undefined, credentials: ClientCredentials): Promise<string | null> {
        if (idToken === undefined) {
            return null;
        }
        try {
            const verified: { payload: { email?: unknown } } = await jwtVerify(idToken, this.keys, {
                issuer: [...ISSUERS],
                audience: credentials.clientId
            });
            return typeof verified.payload.email === 'string' ? verified.payload.email.toLowerCase() : null;
        } catch {
            return null;
        }
    }
}
