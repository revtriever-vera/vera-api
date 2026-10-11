import { Injectable } from '@nestjs/common';
import { AuthTokens, RequestMeta, SessionIssuerPort } from '../ports/session-issuer.port';

@Injectable()
export class SessionApplication {
    public constructor(private readonly sessionIssuer: SessionIssuerPort) {}

    public async refresh(rawRefreshToken: string, meta: RequestMeta): Promise<AuthTokens> {
        return this.sessionIssuer.refresh(rawRefreshToken, meta);
    }

    public async logout(rawRefreshToken: string): Promise<void> {
        await this.sessionIssuer.logout(rawRefreshToken);
    }
}
