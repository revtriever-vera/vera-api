import { Insertable, Selectable } from 'kysely';
import { AppContext } from '../../context/app-context.port';
import { DatabaseClient } from '../database.client';
import { MissingTenantContextError } from '../database.errors';
import { DB } from '../generated/database.types';
import { FindManyOptions, GlobalRepository, PageExec, WhereFilter } from './global.repository';

type TenantColumns = { companyId: unknown; deletedAt: unknown };

export type TenantTable = { [K in keyof DB]: DB[K] extends TenantColumns ? K : never }[keyof DB];

export abstract class TenantRepository<TB extends TenantTable> extends GlobalRepository<TB> {
    public constructor(
        database: DatabaseClient,
        protected readonly context: AppContext,
        table: TB
    ) {
        super(database, table);
    }

    protected get companyId(): string {
        const companyId: string | undefined = this.context.getOrNull()?.companyId;
        if (companyId === undefined) {
            throw new MissingTenantContextError(this.table);
        }
        return companyId;
    }

    protected override scopeFilter(): Record<string, unknown> {
        return { deletedAt: null, companyId: this.companyId };
    }

    protected override async createRow(values: Insertable<DB[TB]>): Promise<Selectable<DB[TB]>> {
        return super.createRow(this.stampTenant(values));
    }

    protected override async createManyRows(values: Insertable<DB[TB]>[]): Promise<Selectable<DB[TB]>[]> {
        return super.createManyRows(values.map((value: Insertable<DB[TB]>) => this.stampTenant(value)));
    }

    protected async findManySkipConstraint(where: WhereFilter<TB>, options?: FindManyOptions): Promise<Selectable<DB[TB]>[]> {
        const query: PageExec<Selectable<DB[TB]>> = this.applyOrder(
            this.applyWhere(this.selectAllFrom(), { deletedAt: null, ...where }),
            options?.orderBy ?? []
        );
        return query.limit(options?.limit ?? 100).execute();
    }

    protected async findOneSkipConstraint(where: WhereFilter<TB>): Promise<Selectable<DB[TB]> | null> {
        const rows: Selectable<DB[TB]>[] = await this.findManySkipConstraint(where, { limit: 1 });
        return rows[0] ?? null;
    }

    private stampTenant(values: Insertable<DB[TB]>): Insertable<DB[TB]> {
        return { ...values, companyId: this.companyId };
    }
}
