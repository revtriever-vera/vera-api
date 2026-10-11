import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import {
    BankConnection,
    CONNECTION_LIST_LIMIT,
    CONNECTION_STATUSES,
    ConnectionDraft,
    ConnectionIdentity,
    PLUGGY_PROVIDER,
    SYNCABLE_CONNECTION_STATUSES
} from '../domain/bank-connections.types';

@Injectable()
export class BankConnectionsRepository extends TenantRepository<'BankConnections'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'BankConnections');
    }

    public async listAll(): Promise<BankConnection[]> {
        return this.findMany({}, { limit: CONNECTION_LIST_LIMIT, orderBy: [{ property: 'createdAt', direction: 'asc' }] });
    }

    public async findByExternalItemIds(externalItemIds: readonly string[]): Promise<BankConnection[]> {
        return this.findManyWhereIn('externalItemId', externalItemIds);
    }

    public async countAll(): Promise<number> {
        const row: { total: string | number | bigint } | undefined = await this.db
            .selectFrom('BankConnections')
            .select((builder) => builder.fn.countAll().as('total'))
            .where('companyId', '=', this.companyId)
            .where('deletedAt', 'is', null)
            .executeTakeFirst();
        return Number(row?.total ?? 0);
    }

    public async countConnected(): Promise<number> {
        const row: { total: string | number | bigint } | undefined = await this.db
            .selectFrom('BankConnections')
            .select((builder) => builder.fn.countAll().as('total'))
            .where('companyId', '=', this.companyId)
            .where('deletedAt', 'is', null)
            .where('status', 'in', [...SYNCABLE_CONNECTION_STATUSES])
            .executeTakeFirst();
        return Number(row?.total ?? 0);
    }

    public async insertIfAbsent(draft: ConnectionDraft): Promise<BankConnection | null> {
        const row: BankConnection | undefined = await this.db
            .insertInto('BankConnections')
            .values({
                id: IdUtil.newId(),
                companyId: this.companyId,
                provider: PLUGGY_PROVIDER,
                externalItemId: draft.externalItemId,
                connectorName: draft.connectorName,
                status: draft.status,
                statusReason: draft.statusReason,
                providerStatus: draft.providerStatus,
                consentExpiresAt: draft.consentExpiresAt
            })
            .onConflict((conflict) =>
                conflict.columns(['companyId', 'provider', 'externalItemId']).where('deletedAt', 'is', null).doNothing()
            )
            .returningAll()
            .executeTakeFirst();
        return row ?? null;
    }

    public async resumePaused(): Promise<BankConnection[]> {
        return this.updateManyRows({ status: CONNECTION_STATUSES.paused }, { status: CONNECTION_STATUSES.active, statusReason: null });
    }

    public async disconnectAll(): Promise<BankConnection[]> {
        return this.updateManyRows({}, { status: CONNECTION_STATUSES.disconnected, statusReason: null, deletedAt: new Date() });
    }

    public async disconnectOne(id: string): Promise<BankConnection | null> {
        return this.updateRow(id, { status: CONNECTION_STATUSES.disconnected, statusReason: null, deletedAt: new Date() });
    }

    public async listSyncableAcrossTenants(): Promise<ConnectionIdentity[]> {
        const rows: { id: string; companyId: string }[] = await this.db
            .selectFrom('BankConnections')
            .select(['id', 'companyId'])
            .where('deletedAt', 'is', null)
            .where('status', 'in', [...SYNCABLE_CONNECTION_STATUSES])
            .orderBy('createdAt', 'asc')
            .execute();
        return rows;
    }

    public async findIdentityAcrossTenants(id: string): Promise<ConnectionIdentity | null> {
        const row: BankConnection | null = await this.findOneSkipConstraint({ id });
        return row === null ? null : { id: row.id, companyId: row.companyId };
    }
}
