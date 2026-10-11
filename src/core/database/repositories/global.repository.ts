import { ExpressionBuilder, Insertable, Kysely, Selectable, Updateable } from 'kysely';
import { OrderBy, Page, PageRequest } from '../../../shared/pagination/pagination.types';
import { DatabaseClient } from '../database.client';
import { DB } from '../generated/database.types';

export interface FindManyOptions {
    readonly limit?: number;
    readonly offset?: number;
    readonly orderBy?: readonly OrderBy[];
}

export type ComparisonOperator = '<' | '<=' | '>' | '>=';
export type WhereValue<T> = T | readonly T[] | Partial<Record<ComparisonOperator, T>>;
export type WhereFilter<TB extends keyof DB> = {
    [K in keyof Selectable<DB[TB]>]?: WhereValue<Selectable<DB[TB]>[K]>;
};

export type RepositoryPageRequest<TB extends keyof DB> = PageRequest<WhereFilter<TB>>;

type Ref = ReturnType<Kysely<DB>['dynamic']['ref']>;

interface WhereChain<QB> {
    where(lhs: Ref, op: 'is' | '=' | 'in' | '<' | '<=' | '>' | '>=', rhs: unknown): QB;
}

interface SetChain<QB> {
    set(key: Ref, value: unknown): QB;
}

interface SearchChain<QB> {
    where(factory: (eb: ExpressionBuilder<DB, never>) => unknown): QB;
}

interface OrderChain<QB> {
    orderBy(ref: Ref, direction: 'asc' | 'desc'): QB;
}

interface CountExec {
    select(expr: unknown): { executeTakeFirst(): Promise<Record<string, unknown> | undefined> };
}

interface WhereInChain<QB> {
    where(lhs: Ref, op: 'in', rhs: readonly unknown[]): QB;
}

interface IdSelection {
    select(ref: Ref): WhereBeforeChain;
}

interface WhereBeforeChain {
    where(lhs: Ref, op: 'is' | '=' | 'in' | '<', rhs: unknown): WhereBeforeChain;
    limit(limit: number): { execute(): Promise<{ id: string }[]> };
}

interface DeleteByIds {
    where(lhs: Ref, op: 'in', rhs: readonly string[]): { executeTakeFirst(): Promise<{ numDeletedRows: bigint }> };
}

export interface PageExec<T> {
    limit(limit: number): PageExec<T>;
    offset(offset: number): PageExec<T>;
    execute(): Promise<T[]>;
}

type Patch = Record<string, unknown>;

const DEFAULT_PAGE_SIZE: number = 25;
const MAX_PAGE_SIZE: number = 100;
const DEFAULT_ORDER: readonly OrderBy[] = [{ property: 'createdAt', direction: 'desc' }];

export interface UpsertConflict<TB extends keyof DB> {
    readonly columns: readonly (keyof DB[TB] & string)[];
    readonly update: Updateable<DB[TB]>;
}

export abstract class GlobalRepository<TB extends keyof DB> {
    protected readonly table: TB;

    public constructor(
        protected readonly database: DatabaseClient,
        table: TB
    ) {
        this.table = table;
    }

    protected get db(): Kysely<Pick<DB, TB>> {
        return this.database.executor as unknown as Kysely<Pick<DB, TB>>;
    }

    public async findOne(where: WhereFilter<TB>): Promise<Selectable<DB[TB]> | null> {
        const rows: Selectable<DB[TB]>[] = await this.findMany(where, { limit: 1 });
        return rows[0] ?? null;
    }

    public async findById(id: string): Promise<Selectable<DB[TB]> | null> {
        const query: PageExec<Selectable<DB[TB]>> = this.applyWhere(this.selectAllFrom(), this.byId(id));
        const rows: Selectable<DB[TB]>[] = await query.limit(1).execute();
        return rows[0] ?? null;
    }

    public async update(id: string, patch: Updateable<DB[TB]>): Promise<Selectable<DB[TB]> | null> {
        return this.updateRow(id, patch);
    }

    public async remove(id: string): Promise<void> {
        await this.softDeleteRow(id);
    }

    public async findMany(where: WhereFilter<TB>, options?: FindManyOptions): Promise<Selectable<DB[TB]>[]> {
        const query: PageExec<Selectable<DB[TB]>> = this.applyOrder(
            this.applyWhere(this.selectAllFrom(), this.scoped(where)),
            options?.orderBy ?? []
        );
        return query
            .limit(options?.limit ?? 100)
            .offset(options?.offset ?? 0)
            .execute();
    }

    public async findAllPaginated(request: RepositoryPageRequest<TB>): Promise<Page<Selectable<DB[TB]>>> {
        const page: number = Math.max(request.page ?? 1, 1);
        const pageSize: number = Math.min(Math.max(request.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
        const where: Record<string, unknown> = this.scoped(request.where ?? {});
        const totalRecords: number = await this.countWhere(where, request);
        const data: Selectable<DB[TB]>[] = await this.pageQuery(where, request)
            .limit(pageSize)
            .offset((page - 1) * pageSize)
            .execute();
        return {
            data,
            pagination: { page, pageSize, totalRecords, totalPages: Math.ceil(totalRecords / pageSize) }
        };
    }

    protected async createRow(values: Insertable<DB[TB]>): Promise<Selectable<DB[TB]>> {
        await this.beforeCreate(values);
        const row: Selectable<DB[TB]> = await this.db.insertInto(this.table).values(values).returningAll().executeTakeFirstOrThrow();
        await this.afterCreate(row);
        return row;
    }

    protected async createManyRows(values: Insertable<DB[TB]>[]): Promise<Selectable<DB[TB]>[]> {
        if (values.length === 0) {
            return [];
        }
        await Promise.all(values.map(async (value: Insertable<DB[TB]>) => this.beforeCreate(value)));
        const rows: Selectable<DB[TB]>[] = await this.db.insertInto(this.table).values(values).returningAll().execute();
        await Promise.all(rows.map(async (row: Selectable<DB[TB]>) => this.afterCreate(row)));
        return rows;
    }

    protected async updateRow(id: string, patch: Updateable<DB[TB]>): Promise<Selectable<DB[TB]> | null> {
        await this.beforeUpdate(id, patch);
        const rows: Selectable<DB[TB]>[] = await this.executeUpdateWhere(this.byId(id), patch);
        const row: Selectable<DB[TB]> | null = rows[0] ?? null;
        if (row) {
            await this.afterUpdate(row);
        }
        return row;
    }

    protected async updateManyRows(where: WhereFilter<TB>, patch: Updateable<DB[TB]>): Promise<Selectable<DB[TB]>[]> {
        await this.beforeUpdate(null, patch);
        const rows: Selectable<DB[TB]>[] = await this.executeUpdateWhere(this.scoped(where), patch);
        await Promise.all(rows.map(async (row: Selectable<DB[TB]>) => this.afterUpdate(row)));
        return rows;
    }

    protected async updateManyRowsWithDeleted(where: WhereFilter<TB>, patch: Updateable<DB[TB]>): Promise<Selectable<DB[TB]>[]> {
        await this.beforeUpdate(null, patch);
        const rows: Selectable<DB[TB]>[] = await this.executeUpdateWhere(this.scopedWithDeleted(where), patch);
        await Promise.all(rows.map(async (row: Selectable<DB[TB]>) => this.afterUpdate(row)));
        return rows;
    }

    protected async findManyWithDeleted(where: WhereFilter<TB>, limit: number): Promise<Selectable<DB[TB]>[]> {
        return this.applyWhere(this.selectAllFrom(), this.scopedWithDeleted(where)).limit(limit).execute();
    }

    protected async upsertRow(values: Insertable<DB[TB]>, conflict: UpsertConflict<TB>): Promise<Selectable<DB[TB]>> {
        await this.beforeUpsert(values, conflict.update);
        const row: Selectable<DB[TB]> = await this.db
            .insertInto(this.table)
            .values(values)
            .onConflict((oc) => oc.columns(conflict.columns).doUpdateSet(conflict.update as never))
            .returningAll()
            .executeTakeFirstOrThrow();
        return row;
    }

    protected async softDeleteRow(id: string): Promise<Selectable<DB[TB]> | null> {
        await this.beforeDelete(id);
        const rows: Selectable<DB[TB]>[] = await this.executeUpdateWhere(this.byId(id), this.deletePatch());
        const row: Selectable<DB[TB]> | null = rows[0] ?? null;
        if (row) {
            await this.afterDelete(row);
        }
        return row;
    }

    protected async hardDeleteBefore(column: string, cutoff: Date, batch: number, where: WhereFilter<TB> = {}): Promise<number> {
        const selection: IdSelection = this.db.selectFrom(this.table) as unknown as IdSelection;
        const candidates: WhereBeforeChain = this.applyWhere(selection.select(this.ref('id')), where);
        const rows: { id: string }[] = await candidates.where(this.ref(column), '<', cutoff).limit(batch).execute();
        if (rows.length === 0) {
            return 0;
        }
        const deletion: DeleteByIds = this.db.deleteFrom(this.table);
        const result: { numDeletedRows: bigint } = await deletion
            .where(
                this.ref('id'),
                'in',
                rows.map((row: { id: string }) => row.id)
            )
            .executeTakeFirst();
        return Number(result.numDeletedRows);
    }

    protected async hardDeleteWhere(where: WhereFilter<TB>, batch: number): Promise<number> {
        let deleted: number = 0;
        let removed: number = await this.hardDeleteBatch(where, batch);
        while (removed > 0) {
            deleted += removed;
            removed = removed < batch ? 0 : await this.hardDeleteBatch(where, batch);
        }
        return deleted;
    }

    private async hardDeleteBatch(where: WhereFilter<TB>, batch: number): Promise<number> {
        const selection: IdSelection = this.db.selectFrom(this.table) as unknown as IdSelection;
        const rows: { id: string }[] = await this.applyWhere(selection.select(this.ref('id')), this.scoped(where))
            .limit(batch)
            .execute();
        if (rows.length === 0) {
            return 0;
        }
        const deletion: DeleteByIds = this.db.deleteFrom(this.table);
        const result: { numDeletedRows: bigint } = await deletion
            .where(
                this.ref('id'),
                'in',
                rows.map((row: { id: string }) => row.id)
            )
            .executeTakeFirst();
        return Number(result.numDeletedRows);
    }

    protected async replaceRows(where: Record<string, unknown>, rows: readonly Insertable<DB[TB]>[]): Promise<void> {
        await this.applyWhere(this.db.deleteFrom(this.table), where).execute();
        if (rows.length === 0) {
            return;
        }
        await this.db.insertInto(this.table).values(rows).execute();
    }

    protected scopeFilter(): Record<string, unknown> {
        return { deletedAt: null };
    }

    protected scoped(where: WhereFilter<TB>): Record<string, unknown> {
        return { ...this.scopeFilter(), ...where };
    }

    protected scopedWithDeleted(where: WhereFilter<TB>): Record<string, unknown> {
        return { ...this.scopeFilter(), deletedAt: undefined, ...where };
    }

    protected selectAllFrom(): PageExec<Selectable<DB[TB]>> {
        return this.db.selectFrom(this.table).selectAll() as unknown as PageExec<Selectable<DB[TB]>>;
    }

    protected async findManyWhereIn(column: string, values: readonly string[]): Promise<Selectable<DB[TB]>[]> {
        if (values.length === 0) {
            return [];
        }
        const scoped: PageExec<Selectable<DB[TB]>> = this.applyWhere(this.selectAllFrom(), this.scoped({}));
        const chain: WhereInChain<PageExec<Selectable<DB[TB]>>> = scoped as unknown as WhereInChain<PageExec<Selectable<DB[TB]>>>;
        return chain.where(this.ref(column), 'in', values).execute();
    }

    protected ref(column: string): Ref {
        return this.db.dynamic.ref<string>(`${this.table}.${column}`);
    }

    protected bareRef(column: string): Ref {
        return this.db.dynamic.ref<string>(column);
    }

    protected applyWhere<QB>(qb: QB, where: Record<string, unknown>): QB {
        return Object.entries(where)
            .filter(([, value]: [string, unknown]) => value !== undefined)
            .reduce((acc: QB, [column, value]: [string, unknown]) => {
                const operatorEntries: ReadonlyArray<readonly [ComparisonOperator, unknown]> = this.operatorEntriesFor(value);
                return operatorEntries.reduce((inner: QB, [op, rhs]: readonly [ComparisonOperator, unknown]): QB => {
                    const chain: WhereChain<QB> = inner as WhereChain<QB>;
                    return chain.where(this.ref(column), op, rhs);
                }, acc);
            }, qb);
    }

    private operatorEntriesFor(value: unknown): ReadonlyArray<readonly [ComparisonOperator, unknown]> {
        if (this.isOperatorObject(value)) {
            return Object.entries(value) as ReadonlyArray<readonly [ComparisonOperator, unknown]>;
        }
        return [[this.defaultOperatorFor(value) as ComparisonOperator, value]];
    }

    private isOperatorObject(value: unknown): value is Partial<Record<ComparisonOperator, unknown>> {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
            return false;
        }
        const keys: readonly string[] = Object.keys(value);
        return keys.length > 0 && keys.every((key: string): boolean => this.isComparisonOperator(key));
    }

    private isComparisonOperator(key: string): key is ComparisonOperator {
        return key === '<' || key === '<=' || key === '>' || key === '>=';
    }

    private defaultOperatorFor(value: unknown): 'is' | 'in' | '=' {
        if (value === null) {
            return 'is';
        }
        return Array.isArray(value) ? 'in' : '=';
    }

    protected applySet<QB>(qb: QB, patch: Patch): QB {
        return Object.entries(patch)
            .filter(([, value]: [string, unknown]) => value !== undefined)
            .reduce((acc: QB, [column, value]: [string, unknown]) => {
                const chain: SetChain<QB> = acc as SetChain<QB>;
                return chain.set(this.bareRef(column), value);
            }, qb);
    }

    protected beforeCreate(_values: Insertable<DB[TB]>): Promise<void> {
        return Promise.resolve();
    }

    protected afterCreate(_row: Selectable<DB[TB]>): Promise<void> {
        return Promise.resolve();
    }

    protected beforeUpdate(_id: string | null, _patch: Updateable<DB[TB]>): Promise<void> {
        return Promise.resolve();
    }

    protected beforeUpsert(_values: Insertable<DB[TB]>, _update: Updateable<DB[TB]>): Promise<void> {
        return Promise.resolve();
    }

    protected afterUpdate(_row: Selectable<DB[TB]>): Promise<void> {
        return Promise.resolve();
    }

    protected beforeDelete(_id: string): Promise<void> {
        return Promise.resolve();
    }

    protected afterDelete(_row: Selectable<DB[TB]>): Promise<void> {
        return Promise.resolve();
    }

    protected applySearch<QB>(qb: QB, request: RepositoryPageRequest<TB>): QB {
        const fields: readonly string[] = request.searchFields ?? [];
        const text: string | undefined = request.searchText;
        if (!text || fields.length === 0) {
            return qb;
        }
        const pattern: string = `%${text}%`;
        const chain: SearchChain<QB> = qb as SearchChain<QB>;
        return chain.where((eb: ExpressionBuilder<DB, never>) =>
            eb.or(fields.map((field: string) => eb(this.ref(field), 'ilike', pattern)))
        );
    }

    protected applyOrder<QB>(qb: QB, orderBy: readonly OrderBy[]): QB {
        return orderBy.reduce((acc: QB, order: OrderBy) => {
            const chain: OrderChain<QB> = acc as OrderChain<QB>;
            return chain.orderBy(this.ref(order.property), order.direction);
        }, qb);
    }

    private pageQuery(where: Record<string, unknown>, request: RepositoryPageRequest<TB>): PageExec<Selectable<DB[TB]>> {
        return this.applyOrder(this.applySearch(this.applyWhere(this.selectAllFrom(), where), request), request.orderBy ?? DEFAULT_ORDER);
    }

    private async countWhere(where: Record<string, unknown>, request: RepositoryPageRequest<TB>): Promise<number> {
        const filtered: unknown = this.applySearch(this.applyWhere(this.db.selectFrom(this.table), where), request);
        const row: Record<string, unknown> | undefined = await (filtered as CountExec)
            .select(this.db.fn.countAll().as('total'))
            .executeTakeFirst();
        return Number(row?.['total'] ?? 0);
    }

    private async executeUpdateWhere(where: Record<string, unknown>, patch: Updateable<DB[TB]> | Patch): Promise<Selectable<DB[TB]>[]> {
        return this.applyWhere(this.applySet(this.db.updateTable(this.table), { ...patch, updatedAt: new Date() }), where)
            .returningAll()
            .execute() as Promise<Selectable<DB[TB]>[]>;
    }

    protected byId(id: string): Record<string, unknown> {
        return { ...this.scopeFilter(), id };
    }

    private deletePatch(): Patch {
        return { deletedAt: new Date() };
    }
}
