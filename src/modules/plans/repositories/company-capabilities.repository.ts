import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareTenantRepository } from '../../../core/database/repositories/bare-tenant.repository';
import { CompanyCapability } from '../domain/plans.types';

@Injectable()
export class CompanyCapabilitiesRepository extends BareTenantRepository<'CompanyCapabilities'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'CompanyCapabilities');
    }

    public async listManual(): Promise<CompanyCapability[]> {
        return this.findMany({ origin: 'manual' });
    }
}
