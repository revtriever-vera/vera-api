import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareTenantRepository } from '../../../core/database/repositories/bare-tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { NewStatementImportPreview, StatementImportPreview } from '../domain/statement-import.types';

type CreatePreviewData = Pick<NewStatementImportPreview, 'createdBy' | 'fileSha256' | 'fileName' | 'payload' | 'expiresAt'>;

@Injectable()
export class StatementImportPreviewsRepository extends BareTenantRepository<'StatementImportPreviews'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'StatementImportPreviews');
    }

    public async create(data: CreatePreviewData): Promise<StatementImportPreview> {
        return this.createRow({ id: IdUtil.newId(), companyId: this.companyId, ...data });
    }

    public async findByHash(fileSha256: string): Promise<StatementImportPreview[]> {
        return this.findMany({ fileSha256 });
    }

    public async consume(id: string): Promise<boolean> {
        return (await this.hardDeleteWhere({ id }, 1)) === 1;
    }

    public async removeExpired(id: string, now: Date): Promise<number> {
        return this.hardDeleteBefore('expiresAt', now, 1, { companyId: this.companyId, id });
    }
}
