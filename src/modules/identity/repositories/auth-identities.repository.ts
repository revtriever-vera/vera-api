import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { AuthIdentity, NewAuthIdentity } from '../domain/identity.types';

type CreateAuthIdentityData = Pick<NewAuthIdentity, 'userId' | 'provider' | 'subject' | 'email' | 'emailVerified' | 'lastLoginAt'>;

@Injectable()
export class AuthIdentitiesRepository extends TenantRepository<'AuthIdentities'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'AuthIdentities');
    }

    public async create(data: CreateAuthIdentityData): Promise<AuthIdentity> {
        return this.createRow({ id: IdUtil.newId(), companyId: this.companyId, ...data });
    }

    public async findByProviderSubjectAcrossTenants(provider: string, subject: string): Promise<AuthIdentity | null> {
        return this.findOneSkipConstraint({ provider, subject });
    }

    public async touchLogin(id: string, at: Date): Promise<AuthIdentity | null> {
        return this.updateRow(id, { lastLoginAt: at });
    }
}
