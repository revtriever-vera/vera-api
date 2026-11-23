import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { CompanyDomain } from '../domain/company.domain';
import { PlatformSeedRefusedError } from '../domain/identity.errors';
import {
    Company,
    PLATFORM_COMPANY_NAME,
    PLATFORM_SEED_OUTCOMES,
    PLATFORM_TOTP_RESET_OUTCOMES,
    PlatformSeedOutcome,
    PlatformTotpResetOutcome,
    User
} from '../domain/identity.types';
import { SessionDomain } from '../domain/session.domain';
import { UserTotpDomain } from '../domain/user-totp.domain';
import { UserDomain } from '../domain/user.domain';
import { nameFromEmail } from '../domain/name-from-email.util';
import { PlatformAuditRecorderService } from './platform-audit-recorder.service';
import { PlatformAvailabilityService } from './platform-availability.service';

@Injectable()
export class PlatformSeedService {
    public constructor(
        private readonly availability: PlatformAvailabilityService,
        private readonly companies: CompanyDomain,
        private readonly users: UserDomain,
        private readonly totps: UserTotpDomain,
        private readonly sessions: SessionDomain,
        private readonly audit: PlatformAuditRecorderService
    ) {}

    public async seed(email: string): Promise<PlatformSeedOutcome> {
        if (!this.availability.enabled()) {
            throw new PlatformSeedRefusedError('self_hosted');
        }
        const normalized: string = email.trim().toLowerCase();
        if (normalized === '') {
            throw new PlatformSeedRefusedError('empty_email');
        }
        if (await this.users.findByEmailAcrossTenants(normalized)) {
            return PLATFORM_SEED_OUTCOMES.unchanged;
        }
        await this.provision(normalized);
        return PLATFORM_SEED_OUTCOMES.created;
    }

    public async resetTotp(email: string): Promise<PlatformTotpResetOutcome> {
        if (!this.availability.enabled()) {
            throw new PlatformSeedRefusedError('self_hosted');
        }
        const user: User | null = await this.users.findByEmailAcrossTenants(email.trim().toLowerCase());
        const platform: Company | null = await this.companies.findPlatform();
        if (!user || user.companyId !== platform?.id) {
            return PLATFORM_TOTP_RESET_OUTCOMES.notFound;
        }
        await this.reset(user);
        return PLATFORM_TOTP_RESET_OUTCOMES.reset;
    }

    @UsingTransaction()
    private async reset(user: User): Promise<void> {
        await this.resetInCompany(user.companyId, user);
    }

    @AsCompany()
    private async resetInCompany(_companyId: string, user: User): Promise<void> {
        await this.totps.reset(user.id);
        await this.sessions.revokeAllForUser(user.id);
        await this.audit.totpReset(user);
    }

    @UsingTransaction()
    private async provision(email: string): Promise<void> {
        const company: Company = (await this.companies.findPlatform()) ?? (await this.companies.createPlatform(PLATFORM_COMPANY_NAME));
        await this.createOperator(company.id, email);
    }

    @AsCompany()
    private async createOperator(_companyId: string, email: string): Promise<User> {
        const now: Date = new Date();
        const user: User = await this.users.createOwner({
            email,
            name: nameFromEmail(email),
            emailVerifiedAt: now,
            termsAcceptedAt: now
        });
        await this.audit.adminCreated(user);
        return user;
    }
}
