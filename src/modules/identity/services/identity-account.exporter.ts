import { Injectable } from '@nestjs/common';
import { AuthIdentityDomain } from '../domain/auth-identity.domain';
import { CompanyDomain } from '../domain/company.domain';
import { AccountClosedError } from '../domain/identity.errors';
import { AuthIdentity, Company, Session, User } from '../domain/identity.types';
import { SessionDomain } from '../domain/session.domain';
import { CurrentUserService } from './current-user.service';

export interface AccountCompanyExport {
    readonly name: string;
    readonly locale: string;
    readonly timezone: string;
    readonly createdAt: string;
}

export interface AccountUserExport {
    readonly name: string;
    readonly email: string;
    readonly role: string;
    readonly locale: string | null;
    readonly termsAcceptedAt: string | null;
    readonly createdAt: string;
}

export interface AccountIdentityExport {
    readonly provider: string;
    readonly createdAt: string;
    readonly lastLoginAt: string | null;
}

export interface AccountSessionExport {
    readonly createdAt: string;
    readonly ip: string | null;
    readonly userAgent: string | null;
}

export interface IdentityAccountExport {
    readonly company: AccountCompanyExport;
    readonly user: AccountUserExport;
    readonly identities: AccountIdentityExport[];
    readonly sessions: AccountSessionExport[];
}

@Injectable()
export class IdentityAccountExporter {
    public constructor(
        private readonly currentUser: CurrentUserService,
        private readonly companies: CompanyDomain,
        private readonly identities: AuthIdentityDomain,
        private readonly sessions: SessionDomain
    ) {}

    public async export(): Promise<IdentityAccountExport> {
        const user: User = await this.currentUser.require();
        const company: Company | null = await this.companies.findById(user.companyId);
        if (!company) {
            throw new AccountClosedError(user.companyId);
        }
        const identities: AuthIdentity[] = await this.identities.listForUser(user.id);
        const sessions: Session[] = await this.sessions.listActive(user.id);
        return {
            company: this.companyOf(company),
            user: this.userOf(user),
            identities: identities.map((identity: AuthIdentity): AccountIdentityExport => this.identityOf(identity)),
            sessions: sessions.map((session: Session): AccountSessionExport => this.sessionOf(session))
        };
    }

    private companyOf(company: Company): AccountCompanyExport {
        return {
            name: company.name,
            locale: company.locale,
            timezone: company.timezone,
            createdAt: company.createdAt.toISOString()
        };
    }

    private userOf(user: User): AccountUserExport {
        return {
            name: user.name,
            email: user.email,
            role: user.role,
            locale: user.locale,
            termsAcceptedAt: user.termsAcceptedAt?.toISOString() ?? null,
            createdAt: user.createdAt.toISOString()
        };
    }

    private identityOf(identity: AuthIdentity): AccountIdentityExport {
        return {
            provider: identity.provider,
            createdAt: identity.createdAt.toISOString(),
            lastLoginAt: identity.lastLoginAt?.toISOString() ?? null
        };
    }

    private sessionOf(session: Session): AccountSessionExport {
        return { createdAt: session.createdAt.toISOString(), ip: session.ip, userAgent: session.userAgent };
    }
}
