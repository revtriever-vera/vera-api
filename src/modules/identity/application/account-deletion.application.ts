import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { MailerPort } from '../../../core/mail/mailer.port';
import { ThrottleService } from '../../../core/throttle/throttle.service';
import { AppLocale } from '../../../shared/i18n/locale';
import { AccountDeletionLogDomain } from '../domain/account-deletion-log.domain';
import { CompanyDomain } from '../domain/company.domain';
import { firstNameOf } from '../domain/first-name.util';
import { AccountClosedError, ConfirmationMismatchError, ForbiddenError } from '../domain/identity.errors';
import { ACCOUNT_DELETION_OUTCOMES, Company, effectiveLocale, ErasedArea, USER_ROLES, User } from '../domain/identity.types';
import { AccountDataRegistry } from '../services/account-data.registry';
import { CurrentUserService } from '../services/current-user.service';
import { IdentityLogService } from '../services/identity-log.service';
import { IdentityMetricsService } from '../services/identity-metrics.service';
import { ACCOUNT_DELETED_TEMPLATE } from '../templates/account-deleted.template';

const DELETE_LIMIT: number = 5;
const DELETE_WINDOW_SECONDS: number = 60 * 60;

interface Departing {
    readonly companyId: string;
    readonly email: string;
    readonly firstName: string;
    readonly locale: AppLocale;
}

@Injectable()
export class AccountDeletionApplication {
    public constructor(
        private readonly throttle: ThrottleService,
        private readonly currentUser: CurrentUserService,
        private readonly companies: CompanyDomain,
        private readonly deletionLog: AccountDeletionLogDomain,
        private readonly registry: AccountDataRegistry,
        private readonly mailer: MailerPort,
        private readonly logs: IdentityLogService,
        private readonly metrics: IdentityMetricsService
    ) {}

    public async delete(confirmEmail: string): Promise<void> {
        const departing: Departing = await this.authorize(confirmEmail);
        const requestedAt: Date = new Date();
        this.logs.deletionStarted();
        const areas: ErasedArea[] = await this.eraseAreas(departing.companyId);
        await this.removeAccount(departing, requestedAt, areas);
        this.metrics.accountDeletion(ACCOUNT_DELETION_OUTCOMES.success);
        this.logs.accountDeleted(areas.map((area: ErasedArea): string => area.area));
    }

    private async authorize(confirmEmail: string): Promise<Departing> {
        const user: User = await this.currentUser.require();
        await this.throttle.assertAllowed(`account-delete:${user.id}`, DELETE_LIMIT, DELETE_WINDOW_SECONDS);
        if (user.role !== USER_ROLES.owner) {
            throw new ForbiddenError();
        }
        if (user.email.toLowerCase() !== confirmEmail.trim().toLowerCase()) {
            this.metrics.accountDeletion(ACCOUNT_DELETION_OUTCOMES.mismatch);
            throw new ConfirmationMismatchError();
        }
        return this.departingOf(user);
    }

    private async departingOf(user: User): Promise<Departing> {
        const company: Company | null = await this.companies.findById(user.companyId);
        if (!company) {
            throw new AccountClosedError(user.companyId);
        }
        return {
            companyId: company.id,
            email: user.email,
            firstName: firstNameOf(user.name),
            locale: effectiveLocale(user, company)
        };
    }

    private async eraseAreas(companyId: string): Promise<ErasedArea[]> {
        try {
            return await this.registry.eraseAll(companyId);
        } catch (error: unknown) {
            this.metrics.accountDeletion(ACCOUNT_DELETION_OUTCOMES.erasureFailed);
            throw error;
        }
    }

    @UsingTransaction()
    private async removeAccount(departing: Departing, requestedAt: Date, areas: readonly ErasedArea[]): Promise<void> {
        const record: { readonly companyHash: string } = await this.deletionLog.record({
            companyId: departing.companyId,
            requestedAt,
            completedAt: new Date(),
            areas
        });
        if (!(await this.companies.eraseCompany(departing.companyId))) {
            throw new AccountClosedError(departing.companyId);
        }
        await this.mailer.enqueue({
            template: ACCOUNT_DELETED_TEMPLATE,
            locale: departing.locale,
            props: { firstName: departing.firstName },
            to: { email: departing.email, name: departing.firstName },
            reference: record.companyHash
        });
    }
}
