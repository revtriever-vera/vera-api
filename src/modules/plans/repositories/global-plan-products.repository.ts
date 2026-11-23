import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';

@Injectable()
export class GlobalPlanProductsRepository extends BareGlobalRepository<'GlobalPlanProducts'> {
    public constructor(database: DatabaseClient) {
        super(database, 'GlobalPlanProducts');
    }

    public async priceCentsOf(planId: string, productId: string): Promise<number | null> {
        const row: { priceCents: string } | null = await this.findOne({ planId, productId });
        return row === null ? null : Number(row.priceCents);
    }
}
