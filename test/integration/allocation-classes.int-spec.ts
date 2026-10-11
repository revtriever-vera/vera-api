import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClassAssignmentService } from '../../src/modules/allocation/services/class-assignment.service';
import { ClassNotFoundError } from '../../src/modules/allocation/domain/allocation.errors';
import { SubjectType } from '../../src/modules/allocation/domain/allocation.types';
import { Account, AllocationHarness } from './support/allocation-harness';

interface ClassBody {
    readonly id: string;
    readonly systemKey: string | null;
    readonly aliasKeys: string[];
    readonly name: string | null;
    readonly colorKey: string;
    readonly targetBps: number;
    readonly sortOrder: number;
}

interface ListBody {
    readonly data: ClassBody[];
}

interface ProblemBody {
    readonly type: string;
}

interface AssignmentBody {
    readonly subjectType: string;
    readonly subjectId: string;
    readonly classId: string;
    readonly targetInClassBps: number;
}

describe('allocation classes', () => {
    let harness: AllocationHarness;
    let assignments: ClassAssignmentService;

    beforeAll(async () => {
        harness = await AllocationHarness.start('alloc_classes');
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

    async function assign(account: Account, subjectType: SubjectType, subjectId: string, classId: string): Promise<void> {
        await harness.inCompany(account.company.id, async () => assignments.assign(subjectType, subjectId, classId));
    }

    it('exige sessão em todas as rotas', async () => {
        const id: string = crypto.randomUUID();

        const responses: number[] = await Promise.all([
            harness.call(null, 'GET', '/allocation/classes').then((r) => r.status),
            harness.call(null, 'POST', '/allocation/classes', { name: 'X' }).then((r) => r.status),
            harness.call(null, 'PATCH', `/allocation/classes/${id}`, {}).then((r) => r.status),
            harness.call(null, 'POST', `/allocation/classes/${id}/merge`, { intoClassId: id }).then((r) => r.status),
            harness.call(null, 'DELETE', `/allocation/classes/${id}`).then((r) => r.status),
            harness.call(null, 'PUT', `/allocation/assignments/position/${id}`, { classId: id }).then((r) => r.status)
        ]);

        expect(responses).toEqual([401, 401, 401, 401, 401, 401]);
    });

    it('a primeira leitura cria as oito classes padrão com metas somando 100% e a segunda não duplica', async () => {
        const account: Account = await harness.signUp('defaults');

        const first: ClassBody[] = await list(account);
        const second: ClassBody[] = await list(account);

        expect(first.map((item: ClassBody) => item.systemKey)).toEqual([
            'rf_pos',
            'rf_pre',
            'rf_ipca',
            'acoes_br',
            'fii',
            'acoes_eua',
            'reits',
            'cripto'
        ]);
        expect(first.reduce((acc: number, item: ClassBody) => acc + item.targetBps, 0)).toBe(10000);
        expect(first.map((item: ClassBody) => item.colorKey)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']);
        expect(first.every((item: ClassBody) => item.name === null && item.aliasKeys.length === 0)).toBe(true);
        expect(second.map((item: ClassBody) => item.id)).toEqual(first.map((item: ClassBody) => item.id));
    });

    it('leituras concorrentes na primeira vez não duplicam as classes padrão', async () => {
        const account: Account = await harness.signUp('concurrent');

        const reads: ClassBody[][] = await Promise.all(Array.from({ length: 6 }, async () => list(account)));

        expect(reads.every((classes: ClassBody[]) => classes.length === 8)).toBe(true);
        const count = await harness.pg.query<{ total: string }>('SELECT count(*) AS total FROM "AssetClasses" WHERE "companyId" = $1', [
            account.company.id
        ]);
        expect(count.rows[0]?.total).toBe('8');
    });

    it('cria, renomeia e exclui uma classe do usuário', async () => {
        const account: Account = await harness.signUp('crud');

        const created = await harness.call<ClassBody>(account.token, 'POST', '/allocation/classes', { name: '  Previdência  ' });
        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({ name: 'Previdência', systemKey: null, targetBps: 0, colorKey: 'c9', sortOrder: 9 });

        const renamed = await harness.call<ClassBody>(account.token, 'PATCH', `/allocation/classes/${created.body.id}`, {
            name: 'Previdência privada',
            colorKey: 'c12'
        });
        expect(renamed.status).toBe(200);
        expect(renamed.body).toMatchObject({ name: 'Previdência privada', colorKey: 'c12' });

        const removed = await harness.call(account.token, 'DELETE', `/allocation/classes/${created.body.id}`);
        expect(removed.status).toBe(204);
        expect((await list(account)).some((item: ClassBody) => item.id === created.body.id)).toBe(false);
    });

    it('uma nova classe recebe a menor cor ainda não usada e o nome pode ser reaproveitado depois de excluída', async () => {
        const account: Account = await harness.signUp('colors');
        await list(account);

        const first = await harness.call<ClassBody>(account.token, 'POST', '/allocation/classes', { name: 'Ouro' });
        const second = await harness.call<ClassBody>(account.token, 'POST', '/allocation/classes', { name: 'Prata' });
        await harness.call(account.token, 'DELETE', `/allocation/classes/${first.body.id}`);
        const reused = await harness.call<ClassBody>(account.token, 'POST', '/allocation/classes', { name: 'Ouro' });

        expect(first.body.colorKey).toBe('c9');
        expect(second.body.colorKey).toBe('c10');
        expect(reused.status).toBe(201);
    });

    it('renomeia uma classe padrão e restaura o nome traduzido com null', async () => {
        const account: Account = await harness.signUp('rename-default');
        const fii: ClassBody = byKey(await list(account), 'fii');

        const renamed = await harness.call<ClassBody>(account.token, 'PATCH', `/allocation/classes/${fii.id}`, { name: 'Imóveis' });
        const restored = await harness.call<ClassBody>(account.token, 'PATCH', `/allocation/classes/${fii.id}`, { name: null });

        expect(renamed.body).toMatchObject({ name: 'Imóveis', systemKey: 'fii' });
        expect(restored.body).toMatchObject({ name: null, systemKey: 'fii' });
    });

    it('recusa nome repetido, inclusive contra o nome padrão nos dois idiomas, e nome nulo em classe do usuário', async () => {
        const account: Account = await harness.signUp('names');
        await list(account);
        const mine = await harness.call<ClassBody>(account.token, 'POST', '/allocation/classes', { name: 'Previdência' });

        const duplicate = await harness.call<ProblemBody>(account.token, 'POST', '/allocation/classes', { name: ' PREVIDÊNCIA ' });
        const defaultPt = await harness.call<ProblemBody>(account.token, 'POST', '/allocation/classes', { name: 'fiis' });
        const defaultEn = await harness.call<ProblemBody>(account.token, 'POST', '/allocation/classes', { name: 'Crypto' });
        const nullName = await harness.call<ProblemBody>(account.token, 'PATCH', `/allocation/classes/${mine.body.id}`, { name: null });

        expect([duplicate.status, duplicate.body.type]).toEqual([409, 'allocation.class_name_taken']);
        expect([defaultPt.status, defaultPt.body.type]).toEqual([409, 'allocation.class_name_taken']);
        expect([defaultEn.status, defaultEn.body.type]).toEqual([409, 'allocation.class_name_taken']);
        expect([nullName.status, nullName.body.type]).toEqual([422, 'allocation.class_name_required']);
    });

    it('valida o corpo: nome vazio, longo, com caractere de controle, cor inválida e id que não é uuid', async () => {
        const account: Account = await harness.signUp('validation');

        const statuses: number[] = await Promise.all([
            harness.call(account.token, 'POST', '/allocation/classes', { name: '   ' }).then((r) => r.status),
            harness.call(account.token, 'POST', '/allocation/classes', { name: 'x'.repeat(41) }).then((r) => r.status),
            harness.call(account.token, 'POST', '/allocation/classes', { name: 'a\u0007b' }).then((r) => r.status),
            harness.call(account.token, 'POST', '/allocation/classes', { name: 'Ok', colorKey: 'c13' }).then((r) => r.status),
            harness.call(account.token, 'PATCH', '/allocation/classes/not-a-uuid', { name: 'Ok' }).then((r) => r.status),
            harness.call(account.token, 'PUT', '/allocation/assignments/stock/not-a-uuid', { classId: 'x' }).then((r) => r.status)
        ]);

        expect(statuses).toEqual([400, 400, 400, 400, 400, 400]);
    });

    it('limita a company a 30 classes', async () => {
        const account: Account = await harness.signUp('limit');
        await list(account);

        for (let index = 0; index < 22; index += 1) {
            const created = await harness.call(account.token, 'POST', '/allocation/classes', { name: `Classe ${String(index)}` });
            expect(created.status).toBe(201);
        }
        const overflow = await harness.call<ProblemBody>(account.token, 'POST', '/allocation/classes', { name: 'Demais' });

        expect([overflow.status, overflow.body.type]).toEqual([422, 'allocation.class_limit_reached']);
    });

    it('não exclui classe padrão nem classe com ativo atribuído', async () => {
        const account: Account = await harness.signUp('delete-guards');
        const classes: ClassBody[] = await list(account);
        const mine = await harness.call<ClassBody>(account.token, 'POST', '/allocation/classes', { name: 'Previdência' });
        await assign(account, 'position', crypto.randomUUID(), mine.body.id);

        const standard = await harness.call<ProblemBody>(account.token, 'DELETE', `/allocation/classes/${byKey(classes, 'cripto').id}`);
        const occupied = await harness.call<ProblemBody>(account.token, 'DELETE', `/allocation/classes/${mine.body.id}`);

        expect([standard.status, standard.body.type]).toEqual([422, 'allocation.system_class_not_deletable']);
        expect([occupied.status, occupied.body.type]).toEqual([409, 'allocation.class_not_empty']);
    });

    it('reclassifica um ativo zerando a meta dentro da classe; sem atribuição prévia dá 404', async () => {
        const account: Account = await harness.signUp('reassign');
        const classes: ClassBody[] = await list(account);
        const subjectId: string = crypto.randomUUID();
        await assign(account, 'position', subjectId, byKey(classes, 'acoes_br').id);
        await harness.pg.query('UPDATE "AssetClassAssignments" SET "targetInClassBps" = 4000 WHERE "subjectId" = $1', [subjectId]);

        const same = await harness.call<AssignmentBody>(account.token, 'PUT', `/allocation/assignments/position/${subjectId}`, {
            classId: byKey(classes, 'acoes_br').id
        });
        const moved = await harness.call<AssignmentBody>(account.token, 'PUT', `/allocation/assignments/position/${subjectId}`, {
            classId: byKey(classes, 'fii').id
        });
        const unknown = await harness.call<ProblemBody>(
            account.token,
            'PUT',
            `/allocation/assignments/fixed_income/${crypto.randomUUID()}`,
            { classId: byKey(classes, 'fii').id }
        );
        const missingClass = await harness.call<ProblemBody>(account.token, 'PUT', `/allocation/assignments/position/${subjectId}`, {
            classId: crypto.randomUUID()
        });

        expect(same.body.targetInClassBps).toBe(4000);
        expect(moved.body).toEqual({
            subjectType: 'position',
            subjectId,
            classId: byKey(classes, 'fii').id,
            targetInClassBps: 0
        });
        expect([unknown.status, unknown.body.type]).toEqual([404, 'allocation.assignment_not_found']);
        expect([missingClass.status, missingClass.body.type]).toEqual([404, 'allocation.class_not_found']);
    });

    it('release libera a atribuição e a lista da company reflete', async () => {
        const account: Account = await harness.signUp('release');
        const classes: ClassBody[] = await list(account);
        const subjectId: string = crypto.randomUUID();
        await assign(account, 'fixed_income', subjectId, byKey(classes, 'rf_pos').id);

        const before = await harness.inCompany(account.company.id, async () => assignments.listForCompany());
        await harness.inCompany(account.company.id, async () => assignments.release('fixed_income', subjectId));
        await harness.inCompany(account.company.id, async () => assignments.release('fixed_income', subjectId));
        const after = await harness.inCompany(account.company.id, async () => assignments.listForCompany());

        expect(before).toHaveLength(1);
        expect(after).toHaveLength(0);
    });

    it('isola as companies: B não lista, edita, junta, exclui nem aponta para classe da A', async () => {
        const companyA: Account = await harness.signUp('tenant-a');
        const companyB: Account = await harness.signUp('tenant-b');
        const classesA: ClassBody[] = await list(companyA);
        const mineA = await harness.call<ClassBody>(companyA.token, 'POST', '/allocation/classes', { name: 'Segredo da A' });
        const classesB: ClassBody[] = await list(companyB);
        const subjectB: string = crypto.randomUUID();
        await assign(companyB, 'position', subjectB, byKey(classesB, 'fii').id);

        const ids: Set<string> = new Set(classesA.map((item: ClassBody) => item.id));
        const patch = await harness.call<ProblemBody>(companyB.token, 'PATCH', `/allocation/classes/${mineA.body.id}`, { name: 'Roubada' });
        const mergeFrom = await harness.call<ProblemBody>(companyB.token, 'POST', `/allocation/classes/${mineA.body.id}/merge`, {
            intoClassId: byKey(classesB, 'fii').id
        });
        const mergeInto = await harness.call<ProblemBody>(
            companyB.token,
            'POST',
            `/allocation/classes/${byKey(classesB, 'fii').id}/merge`,
            { intoClassId: mineA.body.id }
        );
        const remove = await harness.call<ProblemBody>(companyB.token, 'DELETE', `/allocation/classes/${mineA.body.id}`);
        const put = await harness.call<ProblemBody>(companyB.token, 'PUT', `/allocation/assignments/position/${subjectB}`, {
            classId: byKey(classesA, 'fii').id
        });
        const assignForeign = harness.inCompany(companyB.company.id, async () =>
            assignments.assign('position', crypto.randomUUID(), byKey(classesA, 'fii').id)
        );

        expect(classesB.every((item: ClassBody) => !ids.has(item.id))).toBe(true);
        expect(classesB.some((item: ClassBody) => item.name === 'Segredo da A')).toBe(false);
        expect([patch, mergeFrom, mergeInto, remove, put].map((r) => [r.status, r.body.type])).toEqual([
            [404, 'allocation.class_not_found'],
            [404, 'allocation.class_not_found'],
            [404, 'allocation.class_not_found'],
            [404, 'allocation.class_not_found'],
            [404, 'allocation.class_not_found']
        ]);
        await expect(assignForeign).rejects.toBeInstanceOf(ClassNotFoundError);
        expect((await list(companyA)).find((item: ClassBody) => item.id === mineA.body.id)?.name).toBe('Segredo da A');
    });
});
