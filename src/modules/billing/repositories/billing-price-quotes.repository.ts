import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareTenantRepository } from '../../../core/database/repositories/bare-tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { BillingPriceQuote, PriceQuoteDraft } from '../domain/billing.types';

@Injectable()
export class BillingPriceQuotesRepository extends BareTenantRepository<'BillingPriceQuotes'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'BillingPriceQuotes');
    }

    public async quote(draft: PriceQuoteDraft): Promise<BillingPriceQuote> {
        const created: BillingPriceQuote | undefined = await this.insertBuilder()
            .values({ id: IdUtil.newId(), companyId: this.companyId, ...draft })
            .onConflict((conflict) => conflict.doNothing())
            .returningAll()
            .executeTakeFirst();
        if (created !== undefined) {
            return created;
        }
        return this.repeat(draft);
    }

    private async repeat(draft: PriceQuoteDraft): Promise<BillingPriceQuote> {
        const existing: BillingPriceQuote | null = await this.findOne({
            subscriptionId: draft.subscriptionId,
            productRef: draft.productRef,
            cycle: draft.cycle
        });
        if (existing === null) {
            throw new Error('billing price quote vanished while being repeated');
        }
        const updated: BillingPriceQuote | null = await this.updateRow(existing.id, {
            requestCount: existing.requestCount + 1,
            updatedAt: new Date()
        });
        return updated ?? existing;
    }

    public async lastCycleOf(subscriptionId: string): Promise<number> {
        const rows: BillingPriceQuote[] = await this.findMany(
            { subscriptionId },
            { limit: 1, orderBy: [{ property: 'cycle', direction: 'desc' }] }
        );
        return rows[0]?.cycle ?? 0;
    }
}
