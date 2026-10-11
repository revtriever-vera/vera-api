import { describe, expect, it } from 'vitest';
import { makeAssignment, makeClass } from '../../../../test/support/allocation-factories';
import { ClassNotFoundError, TargetsIncompleteError, TargetsMustSum100Error } from './allocation.errors';
import { moderateTargets, resolveAssetTargets, resolveClassTargets, sumOf, sumsTo } from './targets';

const ITUB = '00000000-0000-4000-8000-000000000001';
const WEGE = '00000000-0000-4000-8000-000000000002';
const PETR = '00000000-0000-4000-8000-000000000003';

function eightClasses(): ReturnType<typeof makeClass>[] {
    return [2000, 800, 1200, 1500, 700, 2500, 800, 500].map((targetBps: number, index: number) =>
        makeClass({ id: `c${String(index)}`, targetBps })
    );
}

function sumError(action: () => unknown): TargetsMustSum100Error {
    try {
        action();
    } catch (error) {
        return error as TargetsMustSum100Error;
    }
    throw new Error('did not throw');
}

describe('sumsTo', () => {
    it('é exata: 10000 passa, 9999 e 10001 não', () => {
        expect(sumsTo([2500, 7500], 10000)).toBe(true);
        expect(sumsTo([2500, 7499], 10000)).toBe(false);
        expect(sumsTo([2500, 7501], 10000)).toBe(false);
        expect(sumOf([])).toBe(0);
    });
});

describe('resolveClassTargets', () => {
    it('aceita a soma exata e devolve o estado completo', () => {
        const classes = eightClasses();

        const result = resolveClassTargets(
            classes,
            classes.map((item, index) => ({
                classId: item.id,
                targetBps: [1000, 1000, 1000, 1000, 1000, 1000, 1000, 3000][index] as number
            }))
        );

        expect(sumOf(result.map((update) => update.targetBps))).toBe(10000);
    });

    it('9999 e 10001 falham com sumBps', () => {
        const classes = [makeClass({ id: 'a', targetBps: 5000 }), makeClass({ id: 'b', targetBps: 5000 })];

        expect(sumError(() => resolveClassTargets(classes, [{ classId: 'a', targetBps: 4999 }])).meta).toEqual({ sumBps: 9999 });
        expect(sumError(() => resolveClassTargets(classes, [{ classId: 'a', targetBps: 5001 }])).meta).toEqual({ sumBps: 10001 });
    });

    it('lista parcial é validada contra o estado completo, mantendo as omitidas', () => {
        const classes = [makeClass({ id: 'a', targetBps: 6000 }), makeClass({ id: 'b', targetBps: 4000 })];

        const result = resolveClassTargets(classes, [{ classId: 'a', targetBps: 6000 }]);

        expect(result).toEqual([
            { classId: 'a', targetBps: 6000 },
            { classId: 'b', targetBps: 4000 }
        ]);
        expect(() => resolveClassTargets(classes, [{ classId: 'a', targetBps: 7000 }])).toThrow(TargetsMustSum100Error);
    });

    it('classe de outra company ou inexistente dá class_not_found', () => {
        expect(() => resolveClassTargets([makeClass({ id: 'a' })], [{ classId: 'zzz', targetBps: 10000 }])).toThrow(ClassNotFoundError);
    });
});

describe('resolveAssetTargets', () => {
    const assignments = [
        makeAssignment({ id: 'x1', subjectId: ITUB }),
        makeAssignment({ id: 'x2', subjectId: WEGE }),
        makeAssignment({ id: 'x3', subjectId: PETR })
    ];

    function body(values: number[]): { subjectType: string; subjectId: string; targetInClassBps: number }[] {
        return [ITUB, WEGE, PETR].map((subjectId: string, index: number) => ({
            subjectType: 'position',
            subjectId,
            targetInClassBps: values[index] as number
        }));
    }

    it('3333 + 3333 + 3334 passa', () => {
        expect(resolveAssetTargets('c', assignments, body([3333, 3333, 3334])).map((update) => update.targetInClassBps)).toEqual([
            3333, 3333, 3334
        ]);
    });

    it('tudo zero passa', () => {
        expect(resolveAssetTargets('c', assignments, body([0, 0, 0]))).toHaveLength(3);
    });

    it('soma diferente de 10000 e não zerada falha com sumBps', () => {
        expect(sumError(() => resolveAssetTargets('c', assignments, body([3000, 4000, 2900]))).meta).toEqual({ sumBps: 9900 });
    });

    it('faltando uma atribuição, repetida ou de outra classe vira targets_incomplete', () => {
        expect(() => resolveAssetTargets('c', assignments, body([5000, 5000, 0]).slice(0, 2))).toThrow(TargetsIncompleteError);
        const repeated = [...body([5000, 5000, 0]).slice(0, 2), { subjectType: 'position', subjectId: WEGE, targetInClassBps: 0 }];
        expect(() => resolveAssetTargets('c', assignments, repeated)).toThrow(TargetsIncompleteError);
        const foreign = [...body([5000, 5000, 0]).slice(0, 2), { subjectType: 'position', subjectId: 'outro', targetInClassBps: 0 }];
        expect(() => resolveAssetTargets('c', assignments, foreign)).toThrow(TargetsIncompleteError);
        const wrongType = body([5000, 5000, 0]).map((item) => ({ ...item, subjectType: 'fixed_income' }));
        expect(() => resolveAssetTargets('c', assignments, wrongType)).toThrow(TargetsIncompleteError);
    });

    it('classe sem ativos aceita lista vazia', () => {
        expect(resolveAssetTargets('c', [], [])).toEqual([]);
    });
});

describe('moderateTargets', () => {
    it('devolve os padrões por chave, a soma das chaves absorvidas e zero para classe do usuário', () => {
        const classes = [
            makeClass({ id: 'rf', systemKey: 'rf_pos' }),
            makeClass({ id: 'fii', systemKey: 'fii', aliasKeys: ['reits'] }),
            makeClass({ id: 'user', systemKey: null })
        ];

        expect(moderateTargets(classes)).toEqual([
            { classId: 'rf', targetBps: 2000 },
            { classId: 'fii', targetBps: 1500 },
            { classId: 'user', targetBps: 0 }
        ]);
    });

    it('sem classe do usuário as oito classes padrão somam 10000', () => {
        const keys = ['rf_pos', 'rf_pre', 'rf_ipca', 'acoes_br', 'fii', 'acoes_eua', 'reits', 'cripto'];

        const result = moderateTargets(keys.map((systemKey: string) => makeClass({ id: systemKey, systemKey })));

        expect(sumOf(result.map((update) => update.targetBps))).toBe(10000);
    });
});
