import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { CompanyDomain } from '../domain/company.domain';
import { firstNameOf } from '../domain/first-name.util';
import { Company, effectiveLocale, User } from '../domain/identity.types';
import { UserDomain } from '../domain/user.domain';
import { OwnerRecipient } from './owner-recipients.service';

export type MemberRecipient = OwnerRecipient;

@Injectable()
export class MemberRecipientsService {
    public constructor(
        private readonly users: UserDomain,
        private readonly companies: CompanyDomain,
        private readonly context: AppContext
    ) {}

    public async list(): Promise<MemberRecipient[]> {
        const company: Company | null = await this.company();
        if (company === null) {
            return [];
        }
        const members: User[] = await this.users.listMembers();
        return members.map((member: User): MemberRecipient => this.recipientOf(member, company));
    }

    public async find(userId: string): Promise<MemberRecipient | null> {
        const company: Company | null = await this.company();
        const user: User | null = company === null ? null : await this.users.findById(userId);
        return user === null || company === null ? null : this.recipientOf(user, company);
    }

    private async company(): Promise<Company | null> {
        const companyId: string | undefined = this.context.get().companyId;
        return companyId === undefined ? null : this.companies.findById(companyId);
    }

    private recipientOf(user: User, company: Company): MemberRecipient {
        return { userId: user.id, email: user.email, firstName: firstNameOf(user.name), locale: effectiveLocale(user, company) };
    }
}
