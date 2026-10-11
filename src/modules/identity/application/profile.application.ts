import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { AppLocale } from '../../../shared/i18n/locale';
import { CompanyDomain } from '../domain/company.domain';
import { AccountClosedError, UnauthorizedError } from '../domain/identity.errors';
import { Company, effectiveLocale, LoginProvider, Session, User, UserRole } from '../domain/identity.types';
import { SessionDomain } from '../domain/session.domain';
import { UserDomain } from '../domain/user.domain';
import { CurrentUserService } from '../services/current-user.service';

export interface SessionProfile {
    readonly userId: string;
    readonly companyId: string;
    readonly name: string;
    readonly email: string;
    readonly role: UserRole;
    readonly locale: AppLocale;
    readonly preferredLocale: AppLocale | null;
    readonly loginProvider: LoginProvider;
    readonly companyName: string;
}

export interface PreferencesInput {
    readonly locale?: AppLocale | null;
}

@Injectable()
export class ProfileApplication {
    public constructor(
        private readonly currentUser: CurrentUserService,
        private readonly companies: CompanyDomain,
        private readonly users: UserDomain,
        private readonly sessions: SessionDomain,
        private readonly context: AppContext
    ) {}

    public async current(): Promise<SessionProfile> {
        return this.profileOf(await this.currentUser.require());
    }

    public async updatePreferences(input: PreferencesInput): Promise<SessionProfile> {
        const user: User = await this.currentUser.require();
        if (input.locale === undefined) {
            return this.profileOf(user);
        }
        const updated: User = (await this.users.updatePersonalLocale(user.id, input.locale)) ?? user;
        return this.profileOf(updated);
    }

    private async profileOf(user: User): Promise<SessionProfile> {
        const company: Company = await this.requireCompany(user.companyId);
        const session: Session = await this.requireSession();
        return {
            userId: user.id,
            companyId: user.companyId,
            name: user.name,
            email: user.email,
            role: user.role as UserRole,
            locale: effectiveLocale(user, company),
            preferredLocale: user.locale as AppLocale | null,
            loginProvider: session.provider as LoginProvider,
            companyName: company.name
        };
    }

    private async requireCompany(companyId: string): Promise<Company> {
        const company: Company | null = await this.companies.findById(companyId);
        if (!company) {
            throw new AccountClosedError(companyId);
        }
        return company;
    }

    private async requireSession(): Promise<Session> {
        const sessionId: string | undefined = this.context.get().sessionId;
        const session: Session | null = sessionId ? await this.sessions.findById(sessionId) : null;
        if (!session) {
            throw new UnauthorizedError();
        }
        return session;
    }
}
