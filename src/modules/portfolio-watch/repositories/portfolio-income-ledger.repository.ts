import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { IncomeLedgerEntry, IncomeLedgerRow, PRUNE_BATCH } from '../domain/portfolio-watch.types';

@Injectable()
export class PortfolioIncomeLedgerRepository extends TenantRepository<'PortfolioIncomeLedger'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'PortfolioIncomeLedger');
    }

    public async recordIfAbsent(entry: IncomeLedgerEntry): Promise<boolean> {
        const row: { id: string } | undefined = await this.insertBuilder()
            .values({ id: IdUtil.newId(), companyId: this.companyId, ...entry })
            .onConflict((conflict) => conflict.columns(['companyId', 'eventId']).where('deletedAt', 'is', null).doNothing())
            .returning('id')
            .executeTakeFirst();
        return row !== undefined;
    }

    public async eraseAll(): Promise<number> {
        return this.hardDeleteWhere({}, PRUNE_BATCH);
    }

    public async listPage(offset: number, limit: number): Promise<IncomeLedgerRow[]> {
        return this.findMany(
            {},
            {
                limit,
                offset,
                orderBy: [
                    { property: 'createdAt', direction: 'asc' },
                    { property: 'id', direction: 'asc' }
                ]
            }
        );
    }
}
