import { LoginProvider, User, UserRole } from '../domain/identity.types';

export type { LoginProvider } from '../domain/identity.types';

export interface RequestMeta {
    readonly ip?: string;
    readonly userAgent?: string;
}

export interface SessionUser {
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly role: UserRole;
    readonly companyId: string;
}

export interface AuthTokens {
    readonly accessToken: string;
    readonly refreshToken: string;
    readonly user: SessionUser;
}

export abstract class SessionIssuerPort {
    public abstract issueForNewLogin(user: User, meta: RequestMeta, provider: LoginProvider): Promise<AuthTokens>;
    public abstract refresh(rawRefreshToken: string, meta: RequestMeta): Promise<AuthTokens>;
    public abstract logout(rawRefreshToken: string): Promise<void>;
}
