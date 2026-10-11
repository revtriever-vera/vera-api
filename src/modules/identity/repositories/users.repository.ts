import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { NewUser, User } from '../domain/identity.types';

type CreateUserData = Pick<NewUser, 'email' | 'name' | 'role'> & Partial<Pick<NewUser, 'locale' | 'emailVerifiedAt' | 'termsAcceptedAt'>>;

@Injectable()
export class UsersRepository extends TenantRepository<'Users'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'Users');
    }

    public async create(data: CreateUserData): Promise<User> {
        return this.createRow({ id: IdUtil.newId(), companyId: this.companyId, ...data });
    }

    public async findByEmailAcrossTenants(email: string): Promise<User | null> {
        return this.findOneSkipConstraint({ email });
    }

    public async updatePersonalLocale(userId: string, locale: string | null): Promise<User | null> {
        return this.updateRow(userId, { locale });
    }
}
