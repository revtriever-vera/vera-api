import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { NewSeries, SERIES_LIST_LIMIT, SERIES_STATUSES, SeriesPatch, SeriesRow } from '../domain/recurring-series.types';

@Injectable()
export class RecurringSeriesRepository extends TenantRepository<'RecurringSeries'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'RecurringSeries');
    }

    public async lockWrites(): Promise<void> {
        // eslint-disable-next-line local/repository-escape -- o advisory lock não tem linha nem tabela: serializa as escritas de séries de uma company
        await this.rawSql`SELECT pg_advisory_xact_lock(hashtext(${'recurring:' + this.companyId}))`.execute(this.db);
    }

    public async insert(fields: Omit<NewSeries, 'id' | 'companyId'>): Promise<SeriesRow> {
        return this.createRow({ id: IdUtil.newId(), companyId: this.companyId, ...fields });
    }

    public async listAll(): Promise<SeriesRow[]> {
        return this.findMany({}, { limit: SERIES_LIST_LIMIT, orderBy: [{ property: 'createdAt', direction: 'asc' }] });
    }

    public async countAll(): Promise<number> {
        const row: { total: string | number | bigint } | undefined = await this.selectScoped()
            .select((builder) => builder.fn.countAll().as('total'))
            .executeTakeFirst();
        return Number(row?.total ?? 0);
    }

    public async patch(id: string, patch: SeriesPatch): Promise<SeriesRow | null> {
        return this.updateRow(id, patch);
    }

    public async softDelete(id: string): Promise<SeriesRow | null> {
        return this.softDeleteRow(id);
    }

    public async companyIdsWithConfirmedAcrossTenants(): Promise<string[]> {
        const rows: { companyId: string }[] = await this.selectSkipConstraint()
            .select('companyId')
            .distinct()
            .where('status', '=', SERIES_STATUSES.confirmed)
            .where('deletedAt', 'is', null)
            .execute();
        return rows.map((row: { companyId: string }): string => row.companyId);
    }
}
