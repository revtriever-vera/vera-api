import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareTenantRepository } from '../../../core/database/repositories/bare-tenant.repository';
import { CompanyProductLimit } from '../domain/plans.types';

@Injectable()
export class CompanyProductLimitsRepository extends BareTenantRepository<'CompanyProductLimits'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'CompanyProductLimits');
    }

    public async listFor(productId: string, unit: string): Promise<CompanyProductLimit[]> {
        return this.findMany({ productId, unit });
    }
}
