import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { AppLocale } from '../../../shared/i18n/locale';
import { CompanyDomain } from '../domain/company.domain';
import { firstNameOf } from '../domain/first-name.util';
import { Company, effectiveLocale, User } from '../domain/identity.types';
import { UserDomain } from '../domain/user.domain';

export interface OwnerRecipient {
    readonly userId: string;
    readonly email: string;
    readonly firstName: string;
    readonly locale: AppLocale;
}

@Injectable()
export class OwnerRecipientsService {
    public constructor(
        private readonly users: UserDomain,
        private readonly companies: CompanyDomain,
        private readonly context: AppContext
    ) {}

    public async list(): Promise<OwnerRecipient[]> {
        const companyId: string | undefined = this.context.get().companyId;
        const company: Company | null = companyId === undefined ? null : await this.companies.findById(companyId);
        if (company === null) {
            return [];
        }
        const members: User[] = await this.users.listMembers();
        return members
            .filter((member: User): boolean => member.role === 'owner')
            .map((owner: User): OwnerRecipient => ({
                userId: owner.id,
                email: owner.email,
                firstName: firstNameOf(owner.name),
                locale: effectiveLocale(owner, company)
            }));
    }
}
