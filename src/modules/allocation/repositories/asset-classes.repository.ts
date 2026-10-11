import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { AssetClass, NewAssetClass } from '../domain/allocation.types';
import { DefaultClassSeed } from '../domain/default-classes';

type CreateClassData = Pick<NewAssetClass, 'name' | 'colorKey' | 'sortOrder'>;
type UpdateClassData = Partial<Pick<NewAssetClass, 'name' | 'colorKey' | 'targetBps' | 'aliasKeys'>>;

const CLASS_LIMIT: number = 100;

@Injectable()
export class AssetClassesRepository extends TenantRepository<'AssetClasses'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'AssetClasses');
    }

    public async listOrdered(): Promise<AssetClass[]> {
        return this.findMany({}, { limit: CLASS_LIMIT, orderBy: [{ property: 'sortOrder', direction: 'asc' }] });
    }

    public async countSeededIncludingDeleted(systemKeys: readonly string[]): Promise<number> {
        const rows: AssetClass[] = await this.findManyWithDeleted({ systemKey: [...systemKeys] }, systemKeys.length);
        return rows.length;
    }

    public async insertSeedsIfMissing(seeds: readonly DefaultClassSeed[]): Promise<AssetClass[]> {
        const companyId: string = this.companyId;
        return this.db
            .insertInto(this.table)
            .values(
                seeds.map((seed: DefaultClassSeed): NewAssetClass => ({
                    id: IdUtil.newId(),
                    companyId,
                    systemKey: seed.systemKey,
                    colorKey: seed.colorKey,
                    targetBps: seed.targetBps,
                    sortOrder: seed.sortOrder
                }))
            )
            .onConflict((conflict) => conflict.doNothing())
            .returningAll()
            .execute();
    }

    public async create(data: CreateClassData): Promise<AssetClass> {
        return this.createRow({ id: IdUtil.newId(), companyId: this.companyId, ...data });
    }

    public async updateFields(id: string, data: UpdateClassData): Promise<AssetClass | null> {
        return this.updateRow(id, data);
    }

    public async softDelete(id: string): Promise<void> {
        await this.softDeleteRow(id);
    }
}
