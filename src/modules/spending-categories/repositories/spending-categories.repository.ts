import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { CATEGORY_LIST_LIMIT, NewSpendingCategory, SpendingCategory } from '../domain/categories.types';
import { SystemCategorySeed } from '../domain/system-categories';

type CreateCategoryData = Pick<NewSpendingCategory, 'name' | 'kind' | 'flexibility' | 'icon' | 'position'>;
type UpdateCategoryData = Partial<Pick<NewSpendingCategory, 'name' | 'flexibility' | 'icon'>>;

@Injectable()
export class SpendingCategoriesRepository extends TenantRepository<'SpendingCategories'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'SpendingCategories');
    }

    public async listOrdered(): Promise<SpendingCategory[]> {
        return this.findMany({}, { limit: CATEGORY_LIST_LIMIT, orderBy: [{ property: 'position', direction: 'asc' }] });
    }

    public async insertSeedsIfMissing(seeds: readonly SystemCategorySeed[]): Promise<SpendingCategory[]> {
        const companyId: string = this.companyId;
        return this.db
            .insertInto(this.table)
            .values(
                seeds.map((seed: SystemCategorySeed): NewSpendingCategory => ({
                    id: IdUtil.newId(),
                    companyId,
                    systemKey: seed.systemKey,
                    kind: seed.kind,
                    flexibility: seed.flexibility,
                    icon: seed.icon,
                    position: seed.position
                }))
            )
            .onConflict((conflict) => conflict.doNothing())
            .returningAll()
            .execute();
    }

    public async create(data: CreateCategoryData): Promise<SpendingCategory> {
        return this.createRow({ id: IdUtil.newId(), companyId: this.companyId, ...data });
    }

    public async updateFields(id: string, data: UpdateCategoryData): Promise<SpendingCategory | null> {
        return this.updateRow(id, data);
    }

    public async softDelete(id: string): Promise<void> {
        await this.softDeleteRow(id);
    }
}
