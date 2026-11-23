import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { CompanyDomain } from '../domain/company.domain';
import { PlatformSeedRefusedError } from '../domain/identity.errors';
import { Company, PLATFORM_COMPANY_NAME, PLATFORM_SEED_OUTCOMES, PlatformSeedOutcome, User } from '../domain/identity.types';
import { UserDomain } from '../domain/user.domain';
import { nameFromEmail } from '../domain/name-from-email.util';
import { PlatformAvailabilityService } from './platform-availability.service';

@Injectable()
export class PlatformSeedService {
    public constructor(
        private readonly availability: PlatformAvailabilityService,
        private readonly companies: CompanyDomain,
        private readonly users: UserDomain
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

    @UsingTransaction()
    private async provision(email: string): Promise<void> {
        const company: Company = (await this.companies.findPlatform()) ?? (await this.companies.createPlatform(PLATFORM_COMPANY_NAME));
        await this.createOperator(company.id, email);
    }

    @AsCompany()
    private async createOperator(_companyId: string, email: string): Promise<User> {
        const now: Date = new Date();
        return this.users.createOwner({ email, name: nameFromEmail(email), emailVerifiedAt: now, termsAcceptedAt: now });
    }
}
