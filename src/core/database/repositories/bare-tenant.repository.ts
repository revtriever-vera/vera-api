import { Insertable, Selectable } from 'kysely';
import { AppContext } from '../../context/app-context.port';
import { DatabaseClient } from '../database.client';
import { MissingTenantContextError } from '../database.errors';
import { DB } from '../generated/database.types';
import { GlobalRepository } from './global.repository';

type BareTenantColumns = { companyId: unknown };

export type BareTenantTable = { [K in keyof DB]: DB[K] extends BareTenantColumns ? K : never }[keyof DB];

export abstract class BareTenantRepository<TB extends BareTenantTable> extends GlobalRepository<TB> {
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
        return { companyId: this.companyId };
    }

    protected override async createRow(values: Insertable<DB[TB]>): Promise<Selectable<DB[TB]>> {
        return super.createRow(this.stampTenant(values));
    }

    protected override async createManyRows(values: Insertable<DB[TB]>[]): Promise<Selectable<DB[TB]>[]> {
        return super.createManyRows(values.map((value: Insertable<DB[TB]>) => this.stampTenant(value)));
    }

    protected override async replaceRows(where: Record<string, unknown>, rows: readonly Insertable<DB[TB]>[]): Promise<void> {
        return super.replaceRows(
            { companyId: this.companyId, ...where },
            rows.map((row: Insertable<DB[TB]>) => this.stampTenant(row))
        );
    }

    private stampTenant(values: Insertable<DB[TB]>): Insertable<DB[TB]> {
        return { ...values, companyId: this.companyId };
    }
}
