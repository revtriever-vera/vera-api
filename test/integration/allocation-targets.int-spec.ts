import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClassAssignmentService } from '../../src/modules/allocation/services/class-assignment.service';
import { Account, AllocationHarness } from './support/allocation-harness';

interface ClassBody {
    readonly id: string;
    readonly systemKey: string | null;
    readonly targetBps: number;
}

interface ListBody {
    readonly data: ClassBody[];
}

interface AssetsBody {
    readonly classId: string;
    readonly targets: { subjectType: string; subjectId: string; targetInClassBps: number }[];
}

interface ProblemBody {
    readonly type: string;
    readonly meta?: { sumBps?: number };
}

const MODERATE: number[] = [2000, 800, 1200, 1500, 700, 2500, 800, 500];

describe('allocation targets', () => {
    let harness: AllocationHarness;
    let assignments: ClassAssignmentService;

    beforeAll(async () => {
        harness = await AllocationHarness.start('alloc_targets');
        assignments = harness.app.get(ClassAssignmentService, { strict: false });
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

    async function place(account: Account, classId: string): Promise<string> {
        const subjectId: string = crypto.randomUUID();
        await harness.inCompany(account.company.id, async () => assignments.assign('position', subjectId, classId));
        return subjectId;
    }

    function targetsOf(classes: ClassBody[]): number[] {
        return classes.map((item: ClassBody) => item.targetBps);
    }

    it('classes: grava 20/8/12/15/7/25/8/5, rejeita 9900 sem mexer em nada e aceita parcial que fecha 100', async () => {
        const account: Account = await harness.signUp('targets-classes');
        const classes: ClassBody[] = await list(account);
        const payload = (values: number[]): { targets: { classId: string; targetBps: number }[] } => ({
            targets: classes.map((item: ClassBody, index: number) => ({ classId: item.id, targetBps: values[index] as number }))
        });

        const saved = await harness.call<ListBody>(
            account.token,
            'PUT',
            '/allocation/targets/classes',
            payload([1000, 1000, 1000, 2500, 1000, 1500, 1000, 1000])
        );
        expect(saved.status).toBe(200);
        expect(targetsOf(saved.body.data)).toEqual([1000, 1000, 1000, 2500, 1000, 1500, 1000, 1000]);

        const again = await harness.call<ListBody>(account.token, 'PUT', '/allocation/targets/classes', payload(MODERATE));
        expect(again.status).toBe(200);
        expect(targetsOf(again.body.data)).toEqual(MODERATE);

        const wrong = await harness.call<ProblemBody>(
            account.token,
            'PUT',
            '/allocation/targets/classes',
            payload([2000, 800, 1200, 1500, 700, 2500, 800, 400])
        );
        expect(wrong.status).toBe(422);
        expect(wrong.body.type).toBe('allocation.targets_must_sum_100');
        expect(wrong.body.meta?.sumBps).toBe(9900);
        expect(targetsOf(await list(account))).toEqual(MODERATE);

        const partial = await harness.call<ListBody>(account.token, 'PUT', '/allocation/targets/classes', {
            targets: [
                { classId: byKey(classes, 'rf_pos').id, targetBps: 1500 },
                { classId: byKey(classes, 'cripto').id, targetBps: 1000 }
            ]
        });
        expect(partial.status).toBe(200);
        expect(byKey(partial.body.data, 'rf_pos').targetBps).toBe(1500);
        expect(byKey(partial.body.data, 'acoes_br').targetBps).toBe(1500);
        expect(targetsOf(partial.body.data).reduce((a: number, b: number) => a + b, 0)).toBe(10000);

        const partialWrong = await harness.call<ProblemBody>(account.token, 'PUT', '/allocation/targets/classes', {
            targets: [{ classId: byKey(classes, 'rf_pos').id, targetBps: 1600 }]
        });
        expect(partialWrong.status).toBe(422);
        expect(partialWrong.body.meta?.sumBps).toBe(10100);
    });

    it('classes: classId repetido ou fora da faixa dá 400 e classe inexistente dá 404', async () => {
        const account: Account = await harness.signUp('targets-invalid');
        const classes: ClassBody[] = await list(account);
        const first: string = (classes[0] as ClassBody).id;

        const repeated = await harness.call<ProblemBody>(account.token, 'PUT', '/allocation/targets/classes', {
            targets: [
                { classId: first, targetBps: 5000 },
                { classId: first, targetBps: 5000 }
            ]
        });
        const outOfRange = await harness.call<ProblemBody>(account.token, 'PUT', '/allocation/targets/classes', {
            targets: [{ classId: first, targetBps: 10001 }]
        });
        const missing = await harness.call<ProblemBody>(account.token, 'PUT', '/allocation/targets/classes', {
            targets: [{ classId: crypto.randomUUID(), targetBps: 10000 }]
        });

        expect(repeated.status).toBe(400);
        expect(outOfRange.status).toBe(400);
        expect(missing.status).toBe(404);
        expect(missing.body.type).toBe('allocation.class_not_found');
    });

    it('ativos: Ações Brasil com ITUB4, WEGE3 e PETR4 em 30/40/30, incompleto, tudo zero e ativo de quantidade zero', async () => {
        const account: Account = await harness.signUp('targets-assets');
        const acoes: ClassBody = byKey(await list(account), 'acoes_br');
        const itub: string = await place(account, acoes.id);
        const wege: string = await place(account, acoes.id);
        const petr: string = await place(account, acoes.id);
        const path: string = `/allocation/targets/classes/${acoes.id}/assets`;
        const body = (values: number[]): { targets: { subjectType: string; subjectId: string; targetInClassBps: number }[] } => ({
            targets: [itub, wege, petr].map((subjectId: string, index: number) => ({
                subjectType: 'position',
                subjectId,
                targetInClassBps: values[index] as number
            }))
        });

        const saved = await harness.call<AssetsBody>(account.token, 'PUT', path, body([3000, 4000, 3000]));
        expect(saved.status).toBe(200);
        expect(saved.body.classId).toBe(acoes.id);
        expect(saved.body.targets.map((item) => item.targetInClassBps)).toEqual([3000, 4000, 3000]);

        const missing = await harness.call<ProblemBody>(account.token, 'PUT', path, { targets: body([5000, 5000, 0]).targets.slice(0, 2) });
        expect(missing.status).toBe(422);
        expect(missing.body.type).toBe('allocation.targets_incomplete');

        const wrongSum = await harness.call<ProblemBody>(account.token, 'PUT', path, body([3000, 3000, 3000]));
        expect(wrongSum.status).toBe(422);
        expect(wrongSum.body.type).toBe('allocation.targets_must_sum_100');
        expect(wrongSum.body.meta?.sumBps).toBe(9000);

        const rounding = await harness.call<AssetsBody>(account.token, 'PUT', path, body([3333, 3333, 3334]));
        expect(rounding.status).toBe(200);

        const zero = await harness.call<AssetsBody>(account.token, 'PUT', path, body([0, 0, 0]));
        expect(zero.status).toBe(200);

        const newcomer: string = await place(account, acoes.id);
        const withZeroQuantity = await harness.call<AssetsBody>(account.token, 'PUT', path, {
            targets: [...body([4000, 4000, 0]).targets, { subjectType: 'position', subjectId: newcomer, targetInClassBps: 2000 }]
        });
        expect(withZeroQuantity.status).toBe(200);
        expect(withZeroQuantity.body.targets.find((item) => item.subjectId === newcomer)?.targetInClassBps).toBe(2000);

        const failedWrite = await harness.call<ProblemBody>(account.token, 'PUT', path, {
            targets: [...body([4000, 4000, 0]).targets, { subjectType: 'position', subjectId: newcomer, targetInClassBps: 1000 }]
        });
        expect(failedWrite.status).toBe(422);
        const rows = await harness.pg.query<{ targetInClassBps: number }>(
            'SELECT "targetInClassBps" FROM "AssetClassAssignments" WHERE "subjectId" = $1',
            [newcomer]
        );
        expect(rows.rows[0]?.targetInClassBps).toBe(2000);
    });

    it('ativos: ativo de outra classe no corpo é incompleto e classe sem ativos aceita lista vazia', async () => {
        const account: Account = await harness.signUp('targets-foreign');
        const classes: ClassBody[] = await list(account);
        const acoes: ClassBody = byKey(classes, 'acoes_br');
        const fii: ClassBody = byKey(classes, 'fii');
        const inFii: string = await place(account, fii.id);
        const inAcoes: string = await place(account, acoes.id);

        const foreign = await harness.call<ProblemBody>(account.token, 'PUT', `/allocation/targets/classes/${acoes.id}/assets`, {
            targets: [
                { subjectType: 'position', subjectId: inAcoes, targetInClassBps: 5000 },
                { subjectType: 'position', subjectId: inFii, targetInClassBps: 5000 }
            ]
        });
        const empty = await harness.call<AssetsBody>(
            account.token,
            'PUT',
            `/allocation/targets/classes/${byKey(classes, 'cripto').id}/assets`,
            {
                targets: []
            }
        );

        expect(foreign.status).toBe(422);
        expect(foreign.body.type).toBe('allocation.targets_incomplete');
        expect(empty.status).toBe(200);
        expect(empty.body.targets).toEqual([]);
    });

    it('reclassificar zera a meta do ativo e a classe de origem pode somar menos que 100 sem erro', async () => {
        const account: Account = await harness.signUp('targets-reassign');
        const classes: ClassBody[] = await list(account);
        const acoes: ClassBody = byKey(classes, 'acoes_br');
        const fii: ClassBody = byKey(classes, 'fii');
        const first: string = await place(account, acoes.id);
        const second: string = await place(account, acoes.id);
        const path: string = `/allocation/targets/classes/${acoes.id}/assets`;
        await harness.call<AssetsBody>(account.token, 'PUT', path, {
            targets: [
                { subjectType: 'position', subjectId: first, targetInClassBps: 6000 },
                { subjectType: 'position', subjectId: second, targetInClassBps: 4000 }
            ]
        });

        const moved = await harness.call<{ targetInClassBps: number }>(account.token, 'PUT', `/allocation/assignments/position/${first}`, {
            classId: fii.id
        });
        const left = await harness.pg.query<{ targetInClassBps: number }>(
            'SELECT "targetInClassBps" FROM "AssetClassAssignments" WHERE "subjectId" = $1',
            [second]
        );

        expect(moved.status).toBe(200);
        expect(moved.body.targetInClassBps).toBe(0);
        expect(left.rows[0]?.targetInClassBps).toBe(4000);
    });

    it('reset: volta à meta moderada, respeita classe absorvida e classe do usuário vai a zero, sem tocar nos ativos', async () => {
        const account: Account = await harness.signUp('targets-reset');
        const classes: ClassBody[] = await list(account);
        const fii: ClassBody = byKey(classes, 'fii');
        const reits: ClassBody = byKey(classes, 'reits');
        const acoes: ClassBody = byKey(classes, 'acoes_br');
        const asset: string = await place(account, acoes.id);
        await harness.call<AssetsBody>(account.token, 'PUT', `/allocation/targets/classes/${acoes.id}/assets`, {
            targets: [{ subjectType: 'position', subjectId: asset, targetInClassBps: 10000 }]
        });
        await harness.call(account.token, 'POST', `/allocation/classes/${fii.id}/merge`, { intoClassId: reits.id });
        const custom = await harness.call<ClassBody>(account.token, 'POST', '/allocation/classes', { name: 'Minha classe' });
        await harness.call<ListBody>(account.token, 'PUT', '/allocation/targets/classes', {
            targets: [
                { classId: acoes.id, targetBps: 500 },
                { classId: byKey(classes, 'cripto').id, targetBps: 1000 }
            ]
        });

        const reset = await harness.call<ListBody>(account.token, 'POST', '/allocation/targets/reset');

        expect(reset.status).toBe(200);
        expect(byKey(reset.body.data, 'reits').targetBps).toBe(1500);
        expect(byKey(reset.body.data, 'acoes_br').targetBps).toBe(1500);
        expect(byKey(reset.body.data, 'cripto').targetBps).toBe(500);
        expect(reset.body.data.find((item: ClassBody) => item.id === custom.body.id)?.targetBps).toBe(0);
        expect(targetsOf(reset.body.data).reduce((a: number, b: number) => a + b, 0)).toBe(10000);
        const kept = await harness.pg.query<{ targetInClassBps: number }>(
            'SELECT "targetInClassBps" FROM "AssetClassAssignments" WHERE "subjectId" = $1',
            [asset]
        );
        expect(kept.rows[0]?.targetInClassBps).toBe(10000);
    });

    it('isolamento: a company B não grava meta em classe da A e sem sessão é 401', async () => {
        const a: Account = await harness.signUp('targets-iso-a');
        const b: Account = await harness.signUp('targets-iso-b');
        const classesA: ClassBody[] = await list(a);
        await list(b);
        const acoesA: ClassBody = byKey(classesA, 'acoes_br');
        const subjectA: string = await place(a, acoesA.id);

        const classWrite = await harness.call<ProblemBody>(b.token, 'PUT', '/allocation/targets/classes', {
            targets: [{ classId: acoesA.id, targetBps: 10000 }]
        });
        const assetsWrite = await harness.call<ProblemBody>(b.token, 'PUT', `/allocation/targets/classes/${acoesA.id}/assets`, {
            targets: [{ subjectType: 'position', subjectId: subjectA, targetInClassBps: 10000 }]
        });
        const anonymous = await harness.call<ProblemBody>(null, 'PUT', '/allocation/targets/classes', { targets: [] });
        const anonymousReset = await harness.call<ProblemBody>(null, 'POST', '/allocation/targets/reset');

        expect(classWrite.status).toBe(404);
        expect(assetsWrite.status).toBe(404);
        expect(anonymous.status).toBe(401);
        expect(anonymousReset.status).toBe(401);
        expect(targetsOf(await list(a))).toEqual(MODERATE);
    });
});
