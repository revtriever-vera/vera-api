import { ClientCredentials, SCOPE_READ_WRITE } from './calendar.types';

const AUTHORIZATION_ENDPOINT: string = 'https://accounts.google.com/o/oauth2/v2/auth';

export interface AuthorizationRequest {
    readonly credentials: ClientCredentials;
    readonly state: string;
    readonly codeChallenge: string;
    readonly loginHint: string | null;
}

export function googleAuthorizationUrl(request: AuthorizationRequest): string {
    const params: URLSearchParams = new URLSearchParams({
        client_id: request.credentials.clientId,
        redirect_uri: request.credentials.redirectUri,
        response_type: 'code',
        scope: SCOPE_READ_WRITE,
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        ...(request.loginHint === null ? {} : { login_hint: request.loginHint }),
        state: request.state,
        code_challenge: request.codeChallenge,
        code_challenge_method: 'S256'
    });
    return `${AUTHORIZATION_ENDPOINT}?${params.toString()}`;
}
