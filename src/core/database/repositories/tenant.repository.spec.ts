import { describe, expect, it } from 'vitest';
import { QueryRecorder } from '../../../../test/support/query-recorder';
import { AlsAppContext } from '../../context/als-app-context';
import { MissingTenantContextError } from '../database.errors';
import { BareGlobalRepository } from './bare-global.repository';
import { BareTenantRepository } from './bare-tenant.repository';
import { TenantRepository } from './tenant.repository';

type AnyRow = Record<string, unknown>;

const TABLE: never = 'TenantFixtures' as unknown as never;

class FixturesRepository extends TenantRepository<never> {
    public constructor(recorder: QueryRecorder, context: AlsAppContext) {
        super(recorder.client, context, TABLE);
    }

    public filter(): AnyRow {
        return this.scopeFilter();
    }

    public async create(): Promise<AnyRow> {
        return await this.createRow({ id: 'id-1' });
    }

    public async createMany(): Promise<AnyRow[]> {
        return await this.createManyRows([{ id: 'a' }, { id: 'b' }]);
    }

    public async acrossTenants(): Promise<AnyRow[]> {
        return await this.findManySkipConstraint({});
    }

    public async oneAcrossTenants(): Promise<AnyRow | null> {
        return await this.findOneSkipConstraint({});
    }

    public async scopedFind(): Promise<unknown[]> {
        return this.findMany({});
    }
}

class BareFixturesRepository extends BareTenantRepository<never> {
    public constructor(recorder: QueryRecorder, context: AlsAppContext) {
        super(recorder.client, context, TABLE);
    }

    public filter(): AnyRow {
        return this.scopeFilter();
    }

    public async create(): Promise<unknown> {
        return this.createRow({ id: 'id-1' });
    }

    public async createMany(): Promise<unknown> {
        return this.createManyRows([{ id: 'a' }]);
    }

    public async replace(): Promise<void> {
        await this.replaceRows({ kind: 'x' }, [{ id: 'a' }]);
    }
}

class BareGlobalFixturesRepository extends BareGlobalRepository<never> {
    public constructor(recorder: QueryRecorder) {
        super(recorder.client, TABLE);
    }

    public filter(): AnyRow {
        return this.scopeFilter();
    }
}

function setup(): { recorder: QueryRecorder; context: AlsAppContext } {
    const recorder: QueryRecorder = new QueryRecorder();
    recorder.rows = [{ id: 'id-1', companyId: 'company-a' }];
    return { recorder, context: new AlsAppContext() };
}

function asCompany<T>(context: AlsAppContext, companyId: string, fn: () => Promise<T>): Promise<T> {
    return context.run({ requestId: 'req-1', companyId, locale: 'pt-BR' }, fn);
}

describe('TenantRepository', () => {
    it('scopeFilter carries the company of the context and excludes soft deleted rows', () => {
        const { recorder, context } = setup();
        const repository: FixturesRepository = new FixturesRepository(recorder, context);

        const filter: AnyRow = context.run({ requestId: 'req-1', companyId: 'company-a', locale: 'pt-BR' }, () => repository.filter());

        expect(filter).toEqual({ deletedAt: null, companyId: 'company-a' });
    });

    it('throws MissingTenantContextError when the context has no company', () => {
        const { recorder, context } = setup();
        const repository: FixturesRepository = new FixturesRepository(recorder, context);

        expect(() => repository.filter()).toThrow(MissingTenantContextError);
        expect(() => context.run({ requestId: 'req-1', locale: 'en' }, () => repository.filter())).toThrow(MissingTenantContextError);
    });

    it('reads are filtered by the company of the context', async () => {
        const { recorder, context } = setup();
        const repository: FixturesRepository = new FixturesRepository(recorder, context);

        await asCompany(context, 'company-a', async () => repository.scopedFind());

        expect(recorder.last.sql).toContain('"TenantFixtures"."companyId" = $');
        expect(recorder.last.sql).toContain('"TenantFixtures"."deletedAt" is null');
        expect(recorder.last.parameters).toContain('company-a');
    });

    it('createRow and createManyRows stamp the company on every row', async () => {
        const { recorder, context } = setup();
        const repository: FixturesRepository = new FixturesRepository(recorder, context);

        await asCompany(context, 'company-a', async () => repository.create());
        expect(recorder.last.parameters).toContain('company-a');

        await asCompany(context, 'company-a', async () => repository.createMany());
        expect(recorder.last.parameters.filter((value: unknown) => value === 'company-a')).toHaveLength(2);
    });

    it('findManySkipConstraint ignores the company filter, which is documented and not a bug', async () => {
        const { recorder, context } = setup();
        const repository: FixturesRepository = new FixturesRepository(recorder, context);

        await repository.acrossTenants();

        expect(recorder.last.sql).not.toContain('companyId');
        expect(recorder.last.sql).toContain('"deletedAt" is null');
        expect(await repository.oneAcrossTenants()).toEqual({ id: 'id-1', companyId: 'company-a' });
    });
});

describe('BareTenantRepository', () => {
    it('scopes by company only, without a soft delete filter', async () => {
        const { recorder, context } = setup();
        const repository: BareFixturesRepository = new BareFixturesRepository(recorder, context);

        await expect(asCompany(context, 'company-a', async () => Promise.resolve(repository.filter()))).resolves.toEqual({
            companyId: 'company-a'
        });
        expect(() => repository.filter()).toThrow(MissingTenantContextError);
    });

    it('stamps the company on create, createMany and replaceRows', async () => {
        const { recorder, context } = setup();
        const repository: BareFixturesRepository = new BareFixturesRepository(recorder, context);

        await asCompany(context, 'company-a', async () => repository.create());
        expect(recorder.last.parameters).toContain('company-a');
        await asCompany(context, 'company-a', async () => repository.createMany());
        expect(recorder.last.parameters).toContain('company-a');
        await asCompany(context, 'company-a', async () => repository.replace());

        expect(recorder.queries.slice(-2).map((query) => query.sql.split(' ')[0])).toEqual(['delete', 'insert']);
        expect(recorder.queries.slice(-2)[0]?.parameters).toContain('company-a');
        expect(recorder.last.parameters).toContain('company-a');
    });
});

describe('BareGlobalRepository', () => {
    it('has no scope at all', () => {
        const { recorder } = setup();

        expect(new BareGlobalFixturesRepository(recorder).filter()).toEqual({});
    });
});
