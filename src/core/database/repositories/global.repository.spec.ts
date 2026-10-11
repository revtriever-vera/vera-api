import { Insertable, Selectable, Updateable } from 'kysely';
import { describe, expect, it } from 'vitest';
import { QueryRecorder } from '../../../../test/support/query-recorder';
import { Page } from '../../../shared/pagination/pagination.types';
import { DB } from '../generated/database.types';
import { GlobalRepository, WhereFilter } from './global.repository';

type Row = Selectable<DB['Throttles']>;

const ROW: Record<string, unknown> = { id: 'id-1', key: 'k', count: 1, deletedAt: null };

class ThrottlesTestRepository extends GlobalRepository<'Throttles'> {
    public constructor(recorder: QueryRecorder) {
        super(recorder.client, 'Throttles');
    }

    public async create(values: Insertable<DB['Throttles']>): Promise<Row> {
        return this.createRow(values);
    }

    public async createMany(values: Insertable<DB['Throttles']>[]): Promise<Row[]> {
        return this.createManyRows(values);
    }

    public async updateMany(where: WhereFilter<'Throttles'>, patch: Updateable<DB['Throttles']>): Promise<Row[]> {
        return this.updateManyRows(where, patch);
    }

    public async updateManyIncludingDeleted(where: WhereFilter<'Throttles'>, patch: Updateable<DB['Throttles']>): Promise<Row[]> {
        return this.updateManyRowsWithDeleted(where, patch);
    }

    public async includingDeleted(where: WhereFilter<'Throttles'>): Promise<Row[]> {
        return this.findManyWithDeleted(where, 10);
    }

    public async upsert(values: Insertable<DB['Throttles']>): Promise<Row> {
        return this.upsertRow(values, { columns: ['key'], update: { count: 5 } });
    }

    public async purgeBefore(cutoff: Date): Promise<number> {
        return this.hardDeleteBefore('createdAt', cutoff, 50, { key: 'k' });
    }

    public async purgeWhere(where: WhereFilter<'Throttles'>, batch: number): Promise<number> {
        return this.hardDeleteWhere(where, batch);
    }

    public async replace(rows: Insertable<DB['Throttles']>[]): Promise<void> {
        await this.replaceRows({ key: 'k' }, rows);
    }

    public async whereIn(values: readonly string[]): Promise<Row[]> {
        return this.findManyWhereIn('key', values);
    }

    public filter(): Record<string, unknown> {
        return this.scopeFilter();
    }
}

function setup(): { recorder: QueryRecorder; repository: ThrottlesTestRepository } {
    const recorder: QueryRecorder = new QueryRecorder();
    recorder.rows = [ROW];
    return { recorder, repository: new ThrottlesTestRepository(recorder) };
}

const NEW_ROW: Insertable<DB['Throttles']> = { id: 'id-1', key: 'k', windowStartedAt: new Date(0) };

describe('GlobalRepository', () => {
    it('scopes every read to rows that are not soft deleted', async () => {
        const { recorder, repository } = setup();

        expect(repository.filter()).toEqual({ deletedAt: null });
        await repository.findOne({ key: 'k' });

        expect(recorder.last.sql).toContain('"Throttles"."deletedAt" is null');
        expect(recorder.last.sql).toContain('"Throttles"."key" = $1');
    });

    it('findById filters by id and returns null when nothing matches', async () => {
        const { recorder, repository } = setup();

        expect(await repository.findById('id-1')).toEqual(ROW);
        recorder.rows = [];

        expect(await repository.findById('id-2')).toBeNull();
        expect(recorder.last.sql).toContain('"Throttles"."id" = $');
    });

    it('findMany applies list, null and comparison operators and ordering', async () => {
        const { recorder, repository } = setup();

        await repository.findMany(
            { key: ['a', 'b'], count: { '>=': 2, '<': 9 }, deletedAt: null },
            { limit: 5, offset: 10, orderBy: [{ property: 'createdAt', direction: 'asc' }] }
        );

        expect(recorder.last.sql).toContain('"Throttles"."key" in ($');
        expect(recorder.last.sql).toContain('"Throttles"."count" >= $');
        expect(recorder.last.sql).toContain('"Throttles"."count" < $');
        expect(recorder.last.sql).toContain('order by "Throttles"."createdAt" asc');
        expect(recorder.last.sql).toContain('limit $');
    });

    it('findAllPaginated counts and pages with a search filter', async () => {
        const { recorder, repository } = setup();
        recorder.rows = [{ total: '3' }];

        const page: Page<Row> = await repository.findAllPaginated({ page: 2, pageSize: 1, searchText: 'ab', searchFields: ['key'] });

        expect(page.pagination).toEqual({ page: 2, pageSize: 1, totalRecords: 3, totalPages: 3 });
        expect(recorder.queries.some((query) => query.sql.includes('"Throttles"."key" ilike $'))).toBe(true);
        expect(recorder.last.sql).toContain('order by "Throttles"."createdAt" desc');
    });

    it('findAllPaginated clamps page and page size', async () => {
        const { recorder, repository } = setup();
        recorder.rows = [{ total: '0' }];

        const page: Page<Row> = await repository.findAllPaginated({ page: 0, pageSize: 5000 });

        expect(page.pagination.page).toBe(1);
        expect(page.pagination.pageSize).toBe(100);
    });

    it('createRow inserts and returns the row', async () => {
        const { recorder, repository } = setup();

        expect(await repository.create(NEW_ROW)).toEqual(ROW);
        expect(recorder.last.sql).toContain('insert into "Throttles"');
    });

    it('createManyRows returns an empty list without touching the database for empty input', async () => {
        const { recorder, repository } = setup();

        expect(await repository.createMany([])).toEqual([]);
        expect(recorder.queries).toHaveLength(0);
        expect(await repository.createMany([NEW_ROW, { ...NEW_ROW, id: 'id-2' }])).toEqual([ROW]);
    });

    it('update stamps updatedAt and returns the updated row, or null when no row matches', async () => {
        const { recorder, repository } = setup();

        expect(await repository.update('id-1', { count: 4 })).toEqual(ROW);
        expect(recorder.last.sql).toContain('update "Throttles" set');
        expect(recorder.last.sql).toContain('"updatedAt" = $');
        recorder.rows = [];

        expect(await repository.update('id-1', { count: 4 })).toBeNull();
    });

    it('update ignores undefined fields in the patch', async () => {
        const { recorder, repository } = setup();

        await repository.update('id-1', { count: undefined, key: 'z' });

        expect(recorder.last.sql).not.toContain('"count" =');
        expect(recorder.last.sql).toContain('"key" = $');
    });

    it('remove soft deletes instead of deleting', async () => {
        const { recorder, repository } = setup();

        await repository.remove('id-1');

        expect(recorder.last.sql).toContain('update "Throttles" set "deletedAt" = $');
        expect(recorder.queries.some((query) => query.sql.startsWith('delete'))).toBe(false);
    });

    it('remove does nothing else when the row does not exist', async () => {
        const { recorder, repository } = setup();
        recorder.rows = [];

        await expect(repository.remove('missing')).resolves.toBeUndefined();
    });

    it('updateManyRows keeps the soft delete filter while the WithDeleted variant drops it', async () => {
        const { recorder, repository } = setup();

        await repository.updateMany({ key: 'k' }, { count: 2 });
        expect(recorder.last.sql).toContain('"deletedAt" is null');

        await repository.updateManyIncludingDeleted({ key: 'k' }, { count: 2 });
        expect(recorder.last.sql).not.toContain('"deletedAt" is null');
    });

    it('findManyWithDeleted does not filter soft deleted rows', async () => {
        const { recorder, repository } = setup();

        await repository.includingDeleted({ key: 'k' });

        expect(recorder.last.sql).not.toContain('"deletedAt" is null');
    });

    it('upsertRow inserts with on conflict do update', async () => {
        const { recorder, repository } = setup();

        expect(await repository.upsert(NEW_ROW)).toEqual(ROW);
        expect(recorder.last.sql).toContain('on conflict ("key") do update set');
    });

    it('hardDeleteBefore selects candidate ids and deletes them in one statement', async () => {
        const { recorder, repository } = setup();
        recorder.rows = [{ id: 'a' }, { id: 'b' }];

        const deleted: number = await repository.purgeBefore(new Date(0));

        expect(deleted).toBe(2);
        expect(recorder.queries[0]?.sql).toContain('"Throttles"."createdAt" < $');
        expect(recorder.last.sql).toContain('delete from "Throttles"');
    });

    it('hardDeleteBefore returns zero when there is nothing to delete', async () => {
        const { recorder, repository } = setup();
        recorder.rows = [];

        expect(await repository.purgeBefore(new Date(0))).toBe(0);
        expect(recorder.queries).toHaveLength(1);
    });

    it('hardDeleteWhere deletes the batch and stops at a short batch', async () => {
        const { recorder, repository } = setup();
        recorder.rows = [{ id: 'a' }];

        expect(await repository.purgeWhere({ key: 'k' }, 5)).toBe(1);
    });

    it('hardDeleteWhere returns zero when no rows match', async () => {
        const { recorder, repository } = setup();
        recorder.rows = [];

        expect(await repository.purgeWhere({ key: 'k' }, 5)).toBe(0);
    });

    it('replaceRows deletes the matching rows and inserts the replacements', async () => {
        const { recorder, repository } = setup();

        await repository.replace([NEW_ROW]);

        expect(recorder.queries.map((query) => query.sql.split(' ')[0])).toEqual(['delete', 'insert']);
    });

    it('replaceRows only deletes when there is nothing to insert', async () => {
        const { recorder, repository } = setup();

        await repository.replace([]);

        expect(recorder.queries).toHaveLength(1);
    });

    it('findManyWhereIn short-circuits on empty input and scopes otherwise', async () => {
        const { recorder, repository } = setup();

        expect(await repository.whereIn([])).toEqual([]);
        expect(recorder.queries).toHaveLength(0);

        await repository.whereIn(['a']);
        expect(recorder.last.sql).toContain('"Throttles"."key" in ($');
        expect(recorder.last.sql).toContain('"deletedAt" is null');
    });
});
