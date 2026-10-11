import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { isUniqueViolationError } from '../../../core/database/database.errors';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { AppLocale } from '../../../shared/i18n/locale';
import { AuthIdentityDomain } from '../domain/auth-identity.domain';
import { CompanyDomain } from '../domain/company.domain';
import { AccountClosedError, EmailInUseError, EmailNotProvidedError } from '../domain/identity.errors';
import { AuthIdentity, Company, LOGIN_OUTCOMES, LoginOutcome, SocialIdentity, User } from '../domain/identity.types';
import { nameFromEmail } from '../domain/name-from-email.util';
import { UserDomain } from '../domain/user.domain';
import { IdentityLogService } from './identity-log.service';

const USERS_EMAIL_UNIQUE_CONSTRAINT: string = 'Users_email_unique';
const IDENTITY_UNIQUE_CONSTRAINT: string = 'AuthIdentities_provider_subject_unique';

export interface ProvisionResult {
    readonly user: User;
    readonly outcome: LoginOutcome;
}

@Injectable()
export class AccountProvisioningService {
    public constructor(
        private readonly companyDomain: CompanyDomain,
        private readonly userDomain: UserDomain,
        private readonly identityDomain: AuthIdentityDomain,
        private readonly logs: IdentityLogService
    ) {}

    public async resolve(identity: SocialIdentity, locale: AppLocale): Promise<ProvisionResult> {
        try {
            return await this.resolveOnce(identity, locale);
        } catch (error: unknown) {
            if (!this.lostRace(error)) {
                throw error;
            }
            return this.resolveOnce(identity, locale);
        }
    }

    private async resolveOnce(identity: SocialIdentity, locale: AppLocale): Promise<ProvisionResult> {
        const known: AuthIdentity | null = await this.identityDomain.findByProviderSubjectAcrossTenants(
            identity.provider,
            identity.subject
        );
        if (known) {
            return { user: await this.signIn(known.companyId, known), outcome: LOGIN_OUTCOMES.success };
        }
        if (identity.email === null) {
            this.logs.emailNotProvided(identity.provider);
            throw new EmailNotProvidedError(identity.provider);
        }
        const existing: User | null = await this.userDomain.findByEmailAcrossTenants(identity.email);
        if (existing) {
            return this.linkToExisting(existing, identity);
        }
        const user: User = await this.provision(identity, identity.email, locale);
        return { user, outcome: LOGIN_OUTCOMES.newAccount };
    }

    private async linkToExisting(existing: User, identity: SocialIdentity): Promise<ProvisionResult> {
        if (!identity.emailVerified || existing.emailVerifiedAt === null) {
            throw new EmailInUseError();
        }
        await this.linkInCompany(existing.companyId, existing.id, identity);
        this.logs.identityLinked(existing.id, identity.provider);
        return { user: existing, outcome: LOGIN_OUTCOMES.linked };
    }

    private lostRace(error: unknown): boolean {
        return isUniqueViolationError(error, USERS_EMAIL_UNIQUE_CONSTRAINT) || isUniqueViolationError(error, IDENTITY_UNIQUE_CONSTRAINT);
    }

    @AsCompany()
    private async signIn(_companyId: string, known: AuthIdentity): Promise<User> {
        const user: User | null = await this.userDomain.findById(known.userId);
        if (!user) {
            throw new AccountClosedError(known.companyId);
        }
        await this.identityDomain.touchLogin(known.id);
        return user;
    }

    @AsCompany()
    private async linkInCompany(_companyId: string, userId: string, identity: SocialIdentity): Promise<void> {
        await this.identityDomain.link(userId, identity);
    }

    @UsingTransaction()
    private async provision(identity: SocialIdentity, email: string, locale: AppLocale): Promise<User> {
        const name: string = identity.name ?? nameFromEmail(email);
        const company: Company = await this.companyDomain.create({ name, locale });
        return this.createOwner(company.id, identity, email, name);
    }

    @AsCompany()
    private async createOwner(companyId: string, identity: SocialIdentity, email: string, name: string): Promise<User> {
        const now: Date = new Date();
        const user: User = await this.userDomain.createOwner({
            email,
            name,
            emailVerifiedAt: identity.emailVerified ? now : null,
            termsAcceptedAt: now
        });
        await this.identityDomain.link(user.id, identity);
        this.logs.companyProvisioned(companyId, user.id, identity.provider);
        return user;
    }
}
