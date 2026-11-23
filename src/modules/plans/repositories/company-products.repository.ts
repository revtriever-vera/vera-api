import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareTenantRepository } from '../../../core/database/repositories/bare-tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { CompanyProduct, ContractEndReason, ContractSource } from '../domain/plans.types';

export interface NewContractLine {
    readonly productId: string;
    readonly priceCents: number;
    readonly startsAt: Date;
    readonly source: ContractSource;
    readonly subscriptionId: string | null;
}

@Injectable()
export class CompanyProductsRepository extends BareTenantRepository<'CompanyProducts'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'CompanyProducts');
    }

    public async findOpen(productId: string): Promise<CompanyProduct | null> {
        return this.findOne({ productId, endsAt: null });
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
}
