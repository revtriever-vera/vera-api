import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareTenantRepository } from '../../../core/database/repositories/bare-tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { CompanyProduct, ContractEndReason, ContractSource, OpenLinesOfSource, OpenSubscriptionLine } from '../domain/plans.types';

const TRIAL_SOURCE: ContractSource = 'trial';
const CARD_TRIAL_SOURCE: ContractSource = 'card_trial';

export interface NewContractLine {
    readonly productId: string;
    readonly priceCents: number;
    readonly startsAt: Date;
    readonly source: ContractSource;
    readonly subscriptionId: string | null;
    readonly trialEndsAt: Date | null;
}

@Injectable()
export class CompanyProductsRepository extends BareTenantRepository<'CompanyProducts'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'CompanyProducts');
    }

    public async findOpen(productId: string): Promise<CompanyProduct | null> {
        return this.findOne({ productId, endsAt: null });
    }

    public async hasAny(productId: string): Promise<boolean> {
        return (await this.findOne({ productId })) !== null;
    }

    public async openLine(line: NewContractLine): Promise<boolean> {
        const row: { id: string } | undefined = await this.insertBuilder()
            .values({ id: IdUtil.newId(), companyId: this.companyId, ...line })
            .onConflict((conflict) => conflict.columns(['companyId', 'productId']).where('endsAt', 'is', null).doNothing())
            .returning('id')
            .executeTakeFirst();
        return row !== undefined;
    }

    public async closeLine(productId: string, endsAt: Date, reason: ContractEndReason): Promise<boolean> {
        const rows: CompanyProduct[] = await this.updateManyRows(
            { productId, endsAt: null },
            { endsAt, endReason: reason, updatedAt: new Date() }
        );
        return rows.length > 0;
    }

    public async attachSubscription(productId: string, subscriptionId: string): Promise<boolean> {
        const rows: CompanyProduct[] = await this.updateManyRows(
            { productId, endsAt: null, source: [TRIAL_SOURCE, CARD_TRIAL_SOURCE] },
            { subscriptionId, updatedAt: new Date() }
        );
        return rows.length > 0;
    }

    public async detachSubscription(productId: string): Promise<boolean> {
        const rows: CompanyProduct[] = await this.updateManyRows(
            { productId, endsAt: null, source: TRIAL_SOURCE },
            { subscriptionId: null, updatedAt: new Date() }
        );
        return rows.length > 0;
    }

    public async convertTrial(productId: string, subscriptionId: string, priceCents: number): Promise<boolean> {
        const rows: CompanyProduct[] = await this.updateManyRows(
            { productId, endsAt: null, source: TRIAL_SOURCE, subscriptionId },
            { source: 'subscription', priceCents, updatedAt: new Date() }
        );
        return rows.length > 0;
    }

    public async convertCardTrial(productId: string, priceCents: number): Promise<boolean> {
        const rows: CompanyProduct[] = await this.updateManyRows(
            { productId, endsAt: null, source: CARD_TRIAL_SOURCE },
            { source: 'subscription', priceCents, updatedAt: new Date() }
        );
        return rows.length > 0;
    }

    public async markNoticeSent(productId: string, at: Date): Promise<boolean> {
        const rows: CompanyProduct[] = await this.updateManyRows(
            { productId, endsAt: null, source: TRIAL_SOURCE, subscriptionId: null, trialNoticeSentAt: null },
            { trialNoticeSentAt: at, updatedAt: at }
        );
        return rows.length > 0;
    }

    public async listTrialsToProcessAcrossTenants(now: Date, noticeUntil: Date, limit: number): Promise<CompanyProduct[]> {
        return this.selectSkipConstraint()
            .selectAll()
            .where('source', '=', TRIAL_SOURCE)
            .where('endsAt', 'is', null)
            .where((eb) =>
                eb.or([
                    eb('trialEndsAt', '<=', now),
                    eb.and([eb('trialEndsAt', '<=', noticeUntil), eb('trialNoticeSentAt', 'is', null), eb('subscriptionId', 'is', null)])
                ])
            )
            .orderBy('trialEndsAt')
            .limit(limit)
            .execute();
    }

    public async listOpenOfCompaniesAcrossTenants(productId: string, companyIds: readonly string[]): Promise<CompanyProduct[]> {
        if (companyIds.length === 0) {
            return [];
        }
        return this.selectSkipConstraint()
            .selectAll()
            .where('productId', '=', productId)
            .where('endsAt', 'is', null)
            .where('companyId', 'in', companyIds)
            .execute();
    }

    public async openBySourceAcrossTenants(productId: string): Promise<OpenLinesOfSource[]> {
        const rows: { source: string; total: string | number | bigint }[] = await this.selectSkipConstraint()
            .select((eb) => ['source', eb.fn.countAll().as('total')])
            .where('productId', '=', productId)
            .where('endsAt', 'is', null)
            .groupBy('source')
            .execute();
        return rows.map((row): OpenLinesOfSource => ({ source: row.source, lines: Number(row.total) }));
    }

    public async openSubscriptionLinesAcrossTenants(productId: string): Promise<OpenSubscriptionLine[]> {
        const rows: { subscriptionId: string | null; priceCents: string | number | bigint }[] = await this.selectSkipConstraint()
            .select(['subscriptionId', 'priceCents'])
            .where('productId', '=', productId)
            .where('endsAt', 'is', null)
            .where('source', '=', 'subscription')
            .execute();
        return rows.map((row): OpenSubscriptionLine => ({ subscriptionId: row.subscriptionId, priceCents: Number(row.priceCents) }));
    }
}
