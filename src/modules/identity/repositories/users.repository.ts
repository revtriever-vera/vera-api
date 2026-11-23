import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { NewUser, User, UserRole } from '../domain/identity.types';

const MEMBERS_LIMIT: number = 100;
export const ANONYMIZED_EMAIL_DOMAIN: string = 'removed.invalid';
export const ANONYMIZED_NAME: string = 'Pessoa removida';

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

    public async findByIdAcrossTenants(id: string): Promise<User | null> {
        return this.findOneSkipConstraint({ id });
    }

    public async findManyByIdsAcrossTenants(ids: readonly string[]): Promise<User[]> {
        if (ids.length === 0) {
            return [];
        }
        return this.selectSkipConstraint().selectAll().where('id', 'in', ids).execute();
    }

    public async findByEmail(email: string): Promise<User | null> {
        return this.findOne({ email });
    }

    public async listMembers(): Promise<User[]> {
        return this.findMany({}, { orderBy: [{ property: 'createdAt', direction: 'asc' }], limit: MEMBERS_LIMIT });
    }

    public async lockMembers(): Promise<User[]> {
        return this.selectScoped().selectAll().orderBy('createdAt', 'asc').forUpdate().execute();
    }

    public async updateRole(userId: string, role: UserRole): Promise<User | null> {
        return this.updateRow(userId, { role });
    }

    public async markRemoved(userId: string, removedByUserId: string, at: Date): Promise<User | null> {
        return this.updateRow(userId, { deletedAt: at, removedAt: at, removedByUserId });
    }

    public async findRemovedToAnonymize(cutoff: Date, batch: number): Promise<User[]> {
        return this.selectSkipConstraint()
            .selectAll()
            .where('removedAt', '<', cutoff)
            .where('email', 'not like', `%@${ANONYMIZED_EMAIL_DOMAIN}`)
            .orderBy('removedAt', 'asc')
            .limit(batch)
            .execute();
    }

    public async anonymize(userId: string): Promise<void> {
        await this.updateManyRowsWithDeleted(
            { id: userId },
            { name: ANONYMIZED_NAME, email: `${userId}@${ANONYMIZED_EMAIL_DOMAIN}`, locale: null }
        );
    }

    public async updatePersonalLocale(userId: string, locale: string | null): Promise<User | null> {
        return this.updateRow(userId, { locale });
    }
}
