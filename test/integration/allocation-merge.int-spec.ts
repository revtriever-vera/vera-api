import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClassAssignmentService } from '../../src/modules/allocation/services/class-assignment.service';
import { ClassResolverService } from '../../src/modules/allocation/services/class-resolver.service';
import { AssetClass } from '../../src/modules/allocation/domain/allocation.types';
import { Account, AllocationHarness } from './support/allocation-harness';

interface ClassBody {
    readonly id: string;
    readonly systemKey: string | null;
    readonly aliasKeys: string[];
    readonly name: string | null;
    readonly targetBps: number;
}

interface ListBody {
    readonly data: ClassBody[];
}

interface ProblemBody {
    readonly type: string;
}

interface AssignmentRow {
    readonly subjectId: string;
    readonly classId: string;
    readonly targetInClassBps: number;
}

describe('allocation merge', () => {
    let harness: AllocationHarness;
    let assignments: ClassAssignmentService;
    let resolver: ClassResolverService;

    beforeAll(async () => {
        harness = await AllocationHarness.start('alloc_merge');
        assignments = harness.app.get(ClassAssignmentService, { strict: false });
        resolver = harness.app.get(ClassResolverService, { strict: false });
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function list(account: Account): Promise<ClassBody[]> {
        return (await harness.call<ListBody>(account.token, 'GET', '/allocation/classes')).body.data;
    }

    function byKey(classes: ClassBody[], systemKey: string): ClassBody {
        return classes.find((item: ClassBody) => item.systemKey === systemKey) as ClassBody;
    }

    async function place(account: Account, classId: string, targetInClassBps: number): Promise<string> {
        const subjectId: string = crypto.randomUUID();
        await harness.inCompany(account.company.id, async () => assignments.assign('position', subjectId, classId));
        await harness.pg.query('UPDATE "AssetClassAssignments" SET "targetInClassBps" = $1 WHERE "subjectId" = $2', [
            targetInClassBps,
            subjectId
        ]);
        return subjectId;
    }

    async function assignmentsOf(companyId: string): Promise<AssignmentRow[]> {
        const result = await harness.pg.query<AssignmentRow>(
            'SELECT "subjectId", "classId", "targetInClassBps" FROM "AssetClassAssignments" WHERE "companyId" = $1 AND "deletedAt" IS NULL',
            [companyId]
        );
        return result.rows;
    }

    it('junta FIIs e REITs: move as atribuições, soma as metas, recompõe os ativos e a origem some da listagem', async () => {
        const account: Account = await harness.signUp('merge-flow');
        const classes: ClassBody[] = await list(account);
        const fii: ClassBody = byKey(classes, 'fii');
        const reits: ClassBody = byKey(classes, 'reits');
        const fundA: string = await place(account, fii.id, 6000);
        const fundB: string = await place(account, fii.id, 4000);
        const reitC: string = await place(account, reits.id, 5000);
        const reitD: string = await place(account, reits.id, 5000);

        const merged = await harness.call<ClassBody>(account.token, 'POST', `/allocation/classes/${fii.id}/merge`, {
            intoClassId: reits.id
        });

        expect(merged.status).toBe(200);
        expect(merged.body).toMatchObject({ id: reits.id, systemKey: 'reits', aliasKeys: ['fii'], targetBps: 1500 });
        const after: ClassBody[] = await list(account);
        expect(after).toHaveLength(7);
        expect(after.some((item: ClassBody) => item.id === fii.id)).toBe(false);
        expect(after.reduce((acc: number, item: ClassBody) => acc + item.targetBps, 0)).toBe(10000);
        const rows: Map<string, AssignmentRow> = new Map(
            (await assignmentsOf(account.company.id)).map((row: AssignmentRow): [string, AssignmentRow] => [row.subjectId, row])
        );
        expect([fundA, fundB, reitC, reitD].every((id: string) => rows.get(id)?.classId === reits.id)).toBe(true);
        const targets: number[] = [fundA, fundB, reitC, reitD].map((id: string) => rows.get(id)?.targetInClassBps ?? -1);
        expect(targets).toEqual([2800, 1867, 2667, 2666]);
    });

    it('as duas chaves continuam resolvíveis para a classe que absorveu, e a padrão juntada não é recriada', async () => {
        const account: Account = await harness.signUp('merge-resolve');
        const classes: ClassBody[] = await list(account);
        const fii: ClassBody = byKey(classes, 'fii');
        const reits: ClassBody = byKey(classes, 'reits');
        await harness.call(account.token, 'POST', `/allocation/classes/${fii.id}/merge`, { intoClassId: reits.id });
        await harness.call(account.token, 'PATCH', `/allocation/classes/${reits.id}`, { name: 'Imóveis' });

        const viaFii: AssetClass = await harness.inCompany(account.company.id, async () => resolver.resolveBySystemKey('fii'));
        const viaReits: AssetClass = await harness.inCompany(account.company.id, async () => resolver.resolveBySystemKey('reits'));
        const again: ClassBody[] = await list(account);

        expect(viaFii.id).toBe(reits.id);
        expect(viaReits.id).toBe(reits.id);
        expect(viaFii.name).toBe('Imóveis');
        expect(again).toHaveLength(7);
        const total = await harness.pg.query<{ total: string }>(
            'SELECT count(*) AS total FROM "AssetClasses" WHERE "companyId" = $1 AND "systemKey" = $2',
            [account.company.id, 'fii']
        );
        expect(total.rows[0]?.total).toBe('1');
    });

    it('juntar de novo acumula as chaves: a classe final responde por todas', async () => {
        const account: Account = await harness.signUp('merge-chain');
        const classes: ClassBody[] = await list(account);
        const mine = await harness.call<ClassBody>(account.token, 'POST', '/allocation/classes', { name: 'Previdência' });
        await harness.call(account.token, 'POST', `/allocation/classes/${byKey(classes, 'fii').id}/merge`, {
            intoClassId: byKey(classes, 'reits').id
        });
        const result = await harness.call<ClassBody>(account.token, 'POST', `/allocation/classes/${byKey(classes, 'reits').id}/merge`, {
            intoClassId: mine.body.id
        });

        expect(result.body.systemKey).toBeNull();
        expect([...result.body.aliasKeys].sort()).toEqual(['fii', 'reits']);
        const viaFii: AssetClass = await harness.inCompany(account.company.id, async () => resolver.resolveBySystemKey('fii'));
        expect(viaFii.id).toBe(mine.body.id);
    });

    it('recusa juntar uma classe nela mesma e classe que não existe', async () => {
        const account: Account = await harness.signUp('merge-errors');
        const classes: ClassBody[] = await list(account);
        const fii: ClassBody = byKey(classes, 'fii');

        const self = await harness.call<ProblemBody>(account.token, 'POST', `/allocation/classes/${fii.id}/merge`, { intoClassId: fii.id });
        const missing = await harness.call<ProblemBody>(account.token, 'POST', `/allocation/classes/${fii.id}/merge`, {
            intoClassId: crypto.randomUUID()
        });
        await harness.call(account.token, 'POST', `/allocation/classes/${fii.id}/merge`, { intoClassId: byKey(classes, 'reits').id });
        const again = await harness.call<ProblemBody>(account.token, 'POST', `/allocation/classes/${fii.id}/merge`, {
            intoClassId: byKey(classes, 'reits').id
        });

        expect([self.status, self.body.type]).toEqual([422, 'allocation.cannot_merge_into_self']);
        expect([missing.status, missing.body.type]).toEqual([404, 'allocation.class_not_found']);
        expect([again.status, again.body.type]).toEqual([404, 'allocation.class_not_found']);
    });

    it('a classe que absorveu pode ser excluída só depois de esvaziada e a que sobrou vazia é excluível', async () => {
        const account: Account = await harness.signUp('merge-empty');
        const classes: ClassBody[] = await list(account);
        const mine = await harness.call<ClassBody>(account.token, 'POST', '/allocation/classes', { name: 'Previdência' });
        await place(account, byKey(classes, 'acoes_br').id, 10000);

        const merge = await harness.call(account.token, 'POST', `/allocation/classes/${byKey(classes, 'acoes_br').id}/merge`, {
            intoClassId: mine.body.id
        });
        const blocked = await harness.call<ProblemBody>(account.token, 'DELETE', `/allocation/classes/${mine.body.id}`);

        expect(merge.status).toBe(200);
        expect(blocked.body.type).toBe('allocation.class_not_empty');
    });
});
