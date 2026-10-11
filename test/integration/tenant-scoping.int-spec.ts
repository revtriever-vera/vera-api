import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppContext } from '../../src/core/context/app-context.port';
import { DatabaseClient } from '../../src/core/database/database.client';
import { MissingTenantContextError } from '../../src/core/database/database.errors';
import { Page } from '../../src/shared/pagination/pagination.types';
import { TenantRepository } from '../../src/core/database/repositories/tenant.repository';
import { IdUtil } from '../../src/shared/utils/id.util';
import { createTestDatabase, inRollback, TestDatabase } from './support/test-database';

interface TenantFixtureRow {
    readonly id: string;
    readonly companyId: string;
    readonly name: string;
    readonly deletedAt: string | null;
}

class TenantFixturesRepository extends TenantRepository<never> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'TenantFixtures' as unknown as never);
    }

    public async create(name: string): Promise<TenantFixtureRow> {
        const row: unknown = await this.createRow({ id: IdUtil.newId(), name });
        return row as TenantFixtureRow;
    }

    public async createMany(names: readonly string[]): Promise<TenantFixtureRow[]> {
        const rows: unknown = await this.createManyRows(names.map((name: string) => ({ id: IdUtil.newId(), name })));
        return rows as TenantFixtureRow[];
    }

    public async findFixtureById(id: string): Promise<TenantFixtureRow | null> {
        const row: unknown = await this.findById(id);
        return row as TenantFixtureRow | null;
    }

    public async findFirst(): Promise<TenantFixtureRow | null> {
        const row: unknown = await this.findOne({});
        return row as TenantFixtureRow | null;
    }

    public async rename(id: string, name: string): Promise<TenantFixtureRow | null> {
        const row: unknown = await this.update(id, { name });
        return row as TenantFixtureRow | null;
    }

    public async deleteFixture(id: string): Promise<void> {
        await this.remove(id);
    }

    public async search(text: string): Promise<Page<TenantFixtureRow>> {
        const page: unknown = await this.findAllPaginated({ searchText: text, searchFields: ['name'], pageSize: 10 });
        return page as Page<TenantFixtureRow>;
    }

    public async byIds(ids: readonly string[]): Promise<TenantFixtureRow[]> {
        const rows: unknown = await this.findManyWhereIn('id', ids);
        return rows as TenantFixtureRow[];
    }

    public async purgeOlderThan(cutoff: Date): Promise<number> {
        return this.hardDeleteBefore('createdAt', cutoff, 100);
    }

    public async allAcrossTenants(): Promise<TenantFixtureRow[]> {
        const rows: unknown = await this.findManySkipConstraint({});
        return rows as TenantFixtureRow[];
    }
}

describe('tenant scoping', () => {
    let db: TestDatabase;
    let fixtures: TenantFixturesRepository;

    beforeAll(async () => {
        db = await createTestDatabase();
        await sql`
            CREATE TABLE IF NOT EXISTS "TenantFixtures" (
                id uuid PRIMARY KEY,
                "companyId" text NOT NULL,
                name text NOT NULL,
                "createdAt" timestamptz NOT NULL DEFAULT now(),
                "updatedAt" timestamptz NOT NULL DEFAULT now(),
                "deletedAt" timestamptz
            )
        `.execute(db.client.executor);
        fixtures = new TenantFixturesRepository(db.client, db.context);
    });

    afterAll(async () => {
        await sql`DROP TABLE IF EXISTS "TenantFixtures"`.execute(db.client.executor);
        await db.destroy();
    });

    const ctx = (companyId: string, fn: () => Promise<void>): Promise<void> =>
        db.context.run({ requestId: 'test', companyId, locale: 'pt-BR' }, fn);

    it('stamps companyId automatically on insert', async () => {
        await inRollback(db.client, async () => {
            await ctx('company-a', async () => {
                const row: TenantFixtureRow = await fixtures.create('Row A');
                expect(row.companyId).toBe('company-a');
            });
        });
    });

    it('stamps companyId on every row of a batch insert', async () => {
        await inRollback(db.client, async () => {
            await ctx('company-a', async () => {
                const rows: TenantFixtureRow[] = await fixtures.createMany(['Row A', 'Row B']);
                expect(rows.every((row: TenantFixtureRow) => row.companyId === 'company-a')).toBe(true);
            });
        });
    });

    it('never sees rows from another tenant', async () => {
        await inRollback(db.client, async () => {
            let createdId: string = '';
            await ctx('company-a', async () => {
                const row: TenantFixtureRow = await fixtures.create('Row A');
                createdId = row.id;
            });
            await ctx('company-b', async () => {
                expect(await fixtures.findFixtureById(createdId)).toBeNull();
            });
            await ctx('company-a', async () => {
                expect(await fixtures.findFixtureById(createdId)).not.toBeNull();
            });
        });
    });

    it('findOne resolves the first row scoped to the tenant', async () => {
        await inRollback(db.client, async () => {
            await ctx('company-a', async () => {
                await fixtures.create('Row A');
            });
            await ctx('company-b', async () => {
                expect(await fixtures.findFirst()).toBeNull();
            });
            await ctx('company-a', async () => {
                expect(await fixtures.findFirst()).not.toBeNull();
            });
        });
    });

    it('update() changes a row scoped to the tenant', async () => {
        await inRollback(db.client, async () => {
            let id: string = '';
            await ctx('company-a', async () => {
                id = (await fixtures.create('Original')).id;
            });
            await ctx('company-b', async () => {
                expect(await fixtures.rename(id, 'Hijacked')).toBeNull();
            });
            await ctx('company-a', async () => {
                const updated: TenantFixtureRow | null = await fixtures.rename(id, 'Renamed');
                expect(updated?.name).toBe('Renamed');
            });
        });
    });

    it('remove() soft deletes a row, so normal reads stop finding it but findManySkipConstraint still can', async () => {
        await inRollback(db.client, async () => {
            let id: string = '';
            await ctx('company-a', async () => {
                id = (await fixtures.create('To delete')).id;
                await fixtures.deleteFixture(id);
                expect(await fixtures.findFixtureById(id)).toBeNull();
            });

            const all: TenantFixtureRow[] = await fixtures.allAcrossTenants();
            expect(all.find((row: TenantFixtureRow) => row.id === id)?.deletedAt).not.toBeNull();
        });
    });

    it('findAllPaginated searches case-insensitively within the tenant', async () => {
        await inRollback(db.client, async () => {
            await ctx('company-a', async () => {
                await fixtures.create('Vinhos do Vale Premium');
                await fixtures.create('Outro Item');
            });
            await ctx('company-b', async () => {
                await fixtures.create('Vinhos da Serra');
            });

            await ctx('company-a', async () => {
                const page: Page<TenantFixtureRow> = await fixtures.search('VINHOS');
                expect(page.pagination.totalRecords).toBe(1);
                expect(page.data[0]?.name).toBe('Vinhos do Vale Premium');
            });
        });
    });

    it('findManyWhereIn (skipConstraint helpers reused by external-entity style repos) stays scoped to the tenant', async () => {
        await inRollback(db.client, async () => {
            let idA: string = '';
            let idB: string = '';
            await ctx('company-a', async () => {
                idA = (await fixtures.create('Row A')).id;
            });
            await ctx('company-b', async () => {
                idB = (await fixtures.create('Row B')).id;
            });

            await ctx('company-a', async () => {
                const rows: TenantFixtureRow[] = await fixtures.byIds([idA, idB]);
                expect(rows.map((row: TenantFixtureRow) => row.id)).toEqual([idA]);
            });
        });
    });

    it('hardDeleteBefore purges rows older than the cutoff, bypassing soft delete entirely', async () => {
        await inRollback(db.client, async () => {
            await ctx('company-a', async () => {
                await fixtures.create('Old enough to purge');
            });
            const purged: number = await fixtures.purgeOlderThan(new Date(Date.now() + 60_000));
            expect(purged).toBeGreaterThan(0);
        });
    });

    it('findManySkipConstraint ignores the tenant filter — documented, not a bug', async () => {
        await inRollback(db.client, async () => {
            await ctx('company-a', async () => {
                await fixtures.create('Row A');
            });
            await ctx('company-b', async () => {
                await fixtures.create('Row B');
            });

            const rows: TenantFixtureRow[] = await fixtures.allAcrossTenants();

            expect(rows.map((row: TenantFixtureRow): string => row.name).sort()).toEqual(['Row A', 'Row B']);
        });
    });

    it('throws loudly without tenant context', async () => {
        await expect(fixtures.create('no context')).rejects.toThrow(MissingTenantContextError);
    });
});
