import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { NewPluggyCredential, PluggyCredential } from '../domain/bank-connections.types';

type ReplaceData = Pick<NewPluggyCredential, 'sealed' | 'sealerDriver' | 'clientIdHint'>;

const ERASE_BATCH: number = 100;

@Injectable()
export class PluggyCredentialsRepository extends TenantRepository<'PluggyCredentials'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'PluggyCredentials');
    }

    public async findCurrent(): Promise<PluggyCredential | null> {
        return this.findOne({});
    }

    public async replaceCurrent(data: ReplaceData): Promise<{ credential: PluggyCredential; replaced: boolean }> {
        const replaced: number = await this.hardDeleteWhere({}, ERASE_BATCH);
        const credential: PluggyCredential = await this.createRow({
            id: IdUtil.newId(),
            companyId: this.companyId,
            status: 'valid',
            lastVerifiedAt: new Date(),
            lastErrorCode: null,
            ...data
        });
        return { credential, replaced: replaced > 0 };
    }

    public async markValid(id: string): Promise<PluggyCredential | null> {
        return this.updateRow(id, { status: 'valid', lastVerifiedAt: new Date(), lastErrorCode: null });
    }

    public async markInvalid(id: string, errorCode: string): Promise<PluggyCredential | null> {
        return this.updateRow(id, { status: 'invalid', lastErrorCode: errorCode });
    }

    public async replaceSealed(id: string, sealed: string, sealerDriver: string): Promise<PluggyCredential | null> {
        return this.updateRow(id, { sealed, sealerDriver });
    }

    public async eraseAll(): Promise<number> {
        return this.hardDeleteWhere({}, ERASE_BATCH);
    }

    public async listCompanyIdsAcrossTenants(): Promise<string[]> {
        const rows: { companyId: string }[] = await this.db
            .selectFrom('PluggyCredentials')
            .select('companyId')
            .where('deletedAt', 'is', null)
            .execute();
        return rows.map((row: { companyId: string }): string => row.companyId);
    }
}
