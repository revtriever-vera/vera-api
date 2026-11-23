import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { IntegrationCredential, IntegrationKind, KindCount, SealedIntegration } from '../domain/integration.types';

const ERASE_BATCH: number = 100;

@Injectable()
export class IntegrationCredentialsRepository extends TenantRepository<'IntegrationCredentials'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'IntegrationCredentials');
    }

    public async findByKind(kind: IntegrationKind): Promise<IntegrationCredential | null> {
        return this.findOne({ kind });
    }

    public async listAll(): Promise<IntegrationCredential[]> {
        return this.findMany({});
    }

    public async replaceCurrent(data: SealedIntegration): Promise<IntegrationCredential> {
        await this.hardDeleteWhere({ kind: data.kind }, ERASE_BATCH);
        return this.createRow({ id: IdUtil.newId(), companyId: this.companyId, verifiedAt: new Date(), ...data });
    }

    public async eraseKind(kind: IntegrationKind): Promise<number> {
        return this.hardDeleteWhere({ kind }, ERASE_BATCH);
    }

    public async eraseAll(): Promise<number> {
        return this.hardDeleteWhere({}, ERASE_BATCH);
    }

    public async replaceSealed(id: string, sealed: string, sealerDriver: string): Promise<IntegrationCredential | null> {
        return this.updateRow(id, { sealed, sealerDriver });
    }

    public async findByPhoneNumberIdAcrossTenants(phoneNumberId: string): Promise<IntegrationCredential | null> {
        const row: IntegrationCredential | undefined = await this.selectSkipConstraint()
            .selectAll()
            .where('phoneNumberId', '=', phoneNumberId)
            .where('deletedAt', 'is', null)
            .executeTakeFirst();
        return row ?? null;
    }

    public async listCompanyIdsAcrossTenants(): Promise<string[]> {
        const rows: { companyId: string }[] = await this.selectSkipConstraint()
            .select('companyId')
            .where('deletedAt', 'is', null)
            .execute();
        return [...new Set<string>(rows.map((row: { companyId: string }): string => row.companyId))];
    }

    public async listCompanyIdsByKindAcrossTenants(kind: IntegrationKind): Promise<string[]> {
        const rows: { companyId: string }[] = await this.selectSkipConstraint()
            .select('companyId')
            .where('kind', '=', kind)
            .where('deletedAt', 'is', null)
            .execute();
        return rows.map((row: { companyId: string }): string => row.companyId);
    }

    public async countByKindAcrossTenants(): Promise<KindCount[]> {
        const rows: { kind: string; total: string | number | bigint }[] = await this.selectSkipConstraint()
            .select(['kind', (builder) => builder.fn.countAll().as('total')])
            .where('deletedAt', 'is', null)
            .groupBy('kind')
            .execute();
        return rows.map((row: { kind: string; total: string | number | bigint }): KindCount => ({
            kind: row.kind,
            total: Number(row.total)
        }));
    }
}
