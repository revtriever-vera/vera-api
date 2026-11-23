import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { DateUtil } from '../../../shared/utils/date.util';
import {
    CustomerAccount,
    CustomerMember,
    CustomerOverview,
    CustomerPage,
    PlatformAccountReaderService
} from '../../identity/services/platform-account-reader.service';
import { PlatformAuditRecorderService } from '../../identity/services/platform-audit-recorder.service';
import { PlatformPlanOfCompany, PlatformPlanOverview, PlatformPlanReaderService } from '../../plans/services/platform-plan-reader.service';
import { PlatformBillingReaderService } from '../../billing/services/platform-billing-reader.service';
import { PlatformAccountNotFoundError } from '../domain/platform-admin.errors';
import {
    ACCESS_LAYERS,
    AccessLayer,
    AccessRequestDto,
    AccessResponseView,
    AccountDataView,
    AccountItemView,
    AccountListView,
    AccountsQueryDto,
    AccountSummaryView,
    OverviewView
} from '../validation/platform-accounts.schemas';

const RECENT_DAYS: number = 30;

@Injectable()
export class PlatformAccountsApplication {
    public constructor(
        private readonly accounts: PlatformAccountReaderService,
        private readonly plans: PlatformPlanReaderService,
        private readonly billing: PlatformBillingReaderService,
        private readonly audit: PlatformAuditRecorderService,
        private readonly context: AppContext
    ) {}

    public async overview(): Promise<OverviewView> {
        const customers: CustomerOverview = await this.accounts.overview(DateUtil.addDays(new Date(), -RECENT_DAYS));
        const plans: PlatformPlanOverview = await this.plans.overview();
        return {
            accounts: { total: customers.total, createdLast30Days: customers.createdSince },
            plans: {
                free: Math.max(customers.total - plans.premium, 0),
                premium: plans.premium,
                trials: plans.trials,
                trialsWithCard: plans.cardTrials,
                trialsWithoutCard: plans.noCardTrials,
                pastDue: await this.billing.pastDueCount()
            },
            revenue: { estimatedMonthlyCents: await this.billing.estimatedMonthlyRevenueCents(plans.subscriptionLines) }
        };
    }

    public async list(query: AccountsQueryDto): Promise<AccountListView> {
        const page: CustomerPage = await this.accounts.page(query.page, query.pageSize, query.search);
        const plans: Map<string, PlatformPlanOfCompany> = await this.plans.ofCompanies(
            page.items.map((company: CustomerAccount): string => company.id)
        );
        return {
            items: page.items.map((company: CustomerAccount): AccountItemView => this.itemOf(company, plans.get(company.id))),
            page: page.page,
            pageSize: page.pageSize,
            total: page.total
        };
    }

    @UsingTransaction()
    public async access(accountId: string, input: AccessRequestDto): Promise<AccessResponseView> {
        const company: CustomerAccount | null = await this.accounts.find(accountId);
        if (company === null) {
            throw new PlatformAccountNotFoundError();
        }
        const layers: AccessLayer[] = [...new Set(input.layers)];
        await this.audit.accountViewed(this.context.get().userId ?? null, company.id, { reason: input.reason, layers });
        const response: AccessResponseView = { accountId: company.id };
        if (layers.includes(ACCESS_LAYERS.summary)) {
            return this.withData(layers, company, { ...response, summary: await this.summaryOf(company) });
        }
        return this.withData(layers, company, response);
    }

    private async withData(
        layers: readonly AccessLayer[],
        company: CustomerAccount,
        response: AccessResponseView
    ): Promise<AccessResponseView> {
        if (!layers.includes(ACCESS_LAYERS.data)) {
            return response;
        }
        return { ...response, data: (await this.accounts.dataSections(company.id)) as AccountDataView };
    }

    private async summaryOf(company: CustomerAccount): Promise<AccountSummaryView> {
        const plan: PlatformPlanOfCompany | undefined = (await this.plans.ofCompanies([company.id])).get(company.id);
        const people: CustomerMember[] = await this.accounts.members(company.id);
        const sections: Record<string, unknown> = await this.accounts.summarySections(company.id);
        return {
            account: this.itemOf(company, plan),
            locale: company.locale,
            timezone: company.timezone,
            people: people.map((person: CustomerMember) => ({ ...person, joinedAt: person.joinedAt.toISOString() })),
            billing: (sections['billing'] ?? null) as AccountSummaryView['billing'],
            offer: (sections['signup_offer'] ?? null) as AccountSummaryView['offer'],
            usage: (sections['usage'] ?? null) as AccountSummaryView['usage']
        };
    }

    private itemOf(company: CustomerAccount, plan: PlatformPlanOfCompany | undefined): AccountItemView {
        return {
            id: company.id,
            name: company.name,
            createdAt: company.createdAt.toISOString(),
            plan: plan?.plan ?? 'free',
            planSource: plan?.source ?? null,
            trialEndsAt: plan?.trialEndsAt?.toISOString() ?? null
        };
    }
}
