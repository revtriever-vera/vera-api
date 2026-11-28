import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';
import { GlobalProductLimit } from '../domain/plans.types';

@Injectable()
export class GlobalProductLimitsRepository extends BareGlobalRepository<'GlobalProductLimits'> {
    public constructor(database: DatabaseClient) {
        super(database, 'GlobalProductLimits');
    }

    public async listFor(planId: string, productId: string, unit: string): Promise<GlobalProductLimit[]> {
        return this.findMany({ planId, productId, unit });
    }
}
