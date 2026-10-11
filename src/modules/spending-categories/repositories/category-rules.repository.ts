import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { CategoryRule, NewCategoryRule, RULE_LIST_LIMIT, RuleDirection, RuleMatchType } from '../domain/categories.types';

type CreateRuleData = Pick<NewCategoryRule, 'categoryId' | 'matchType' | 'pattern' | 'label' | 'appliesTo'>;
type UpdateRuleData = Partial<Pick<NewCategoryRule, 'categoryId' | 'appliesTo' | 'label'>>;

@Injectable()
export class CategoryRulesRepository extends TenantRepository<'CategoryRules'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'CategoryRules');
    }

    public async listNewestFirst(): Promise<CategoryRule[]> {
        return this.findMany(
            {},
            {
                limit: RULE_LIST_LIMIT,
                orderBy: [
                    { property: 'createdAt', direction: 'desc' },
                    { property: 'id', direction: 'desc' }
                ]
            }
        );
    }

    public async countActive(): Promise<number> {
        const row: { total: string | number | bigint } | undefined = await this.applyWhere(this.db.selectFrom(this.table), this.scoped({}))
            .select(this.db.fn.countAll().as('total'))
            .executeTakeFirst();
        return Number(row?.total ?? 0);
    }

    public async findByMatch(matchType: RuleMatchType, pattern: string, appliesTo: RuleDirection): Promise<CategoryRule | null> {
        return this.findOne({ matchType, pattern, appliesTo });
    }

    public async createIfAbsent(data: CreateRuleData): Promise<CategoryRule | null> {
        const rows: CategoryRule[] = await this.db
            .insertInto(this.table)
            .values({ id: IdUtil.newId(), companyId: this.companyId, ...data })
            .onConflict((conflict) => conflict.doNothing())
            .returningAll()
            .execute();
        return rows[0] ?? null;
    }

    public async updateFields(id: string, data: UpdateRuleData): Promise<CategoryRule | null> {
        return this.updateRow(id, data);
    }

    public async softDelete(id: string): Promise<void> {
        await this.softDeleteRow(id);
    }

    public async softDeleteByCategory(categoryId: string): Promise<CategoryRule[]> {
        return this.updateManyRows({ categoryId }, { deletedAt: new Date() });
    }
}
