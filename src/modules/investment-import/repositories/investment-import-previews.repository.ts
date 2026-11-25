import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareTenantRepository } from '../../../core/database/repositories/bare-tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { InvestmentImportPreview, NewInvestmentImportPreview, PURGE_BATCH } from '../domain/investment-import.types';

type CreatePreviewData = Pick<
    NewInvestmentImportPreview,
    'createdBy' | 'holderUserId' | 'source' | 'fileSha256' | 'fileName' | 'payload' | 'expiresAt'
>;

@Injectable()
export class InvestmentImportPreviewsRepository extends BareTenantRepository<'InvestmentImportPreviews'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'InvestmentImportPreviews');
    }

    public async create(data: CreatePreviewData): Promise<InvestmentImportPreview> {
        return this.createRow({ id: IdUtil.newId(), companyId: this.companyId, ...data });
    }

    public async consume(id: string): Promise<boolean> {
        return (await this.hardDeleteWhere({ id }, 1)) === 1;
    }

    public async purgeExpired(now: Date): Promise<number> {
        let purged: number = 0;
        let removed: number = await this.hardDeleteBefore('expiresAt', now, PURGE_BATCH);
        while (removed > 0) {
            purged += removed;
            removed = await this.hardDeleteBefore('expiresAt', now, PURGE_BATCH);
        }
        return purged;
    }

    public async eraseAll(): Promise<number> {
        return this.hardDeleteWhere({}, PURGE_BATCH);
    }
}
