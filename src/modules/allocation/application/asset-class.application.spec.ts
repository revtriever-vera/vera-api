import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAssignment, makeClass } from '../../../../test/support/allocation-factories';
import { DatabaseClient } from '../../../core/database/database.client';
import { TransactionalContext } from '../../../core/database/using-transaction.decorator';
import { AssetClassDomain } from '../domain/asset-class.domain';
import { ClassAssignmentDomain } from '../domain/class-assignment.domain';
import {
    CannotMergeIntoSelfError,
    ClassLimitReachedError,
    ClassNameRequiredError,
    ClassNameTakenError,
    ClassNotEmptyError,
    ClassNotFoundError,
    SystemClassNotDeletableError
} from '../domain/allocation.errors';
import { AssetClass, AssetClassView, ClassAssignment } from '../domain/allocation.types';
import { AllocationLogService } from '../services/allocation-log.service';
import { AllocationMetricsService } from '../services/allocation-metrics.service';
import { ClassDisplayNameService } from '../services/class-display-name.service';
import { ClassReaderService } from '../services/class-reader.service';
import { AssetClassApplication } from './asset-class.application';

interface Doubles {
    readonly application: ReturnType<typeof makeApplication>;
    readonly classes: Record<string, ReturnType<typeof vi.fn>>;
    readonly assignments: Record<string, ReturnType<typeof vi.fn>>;
    readonly classChanged: ReturnType<typeof vi.fn>;
    readonly classAction: ReturnType<typeof vi.fn>;
}

function makeApplication(
    classes: Record<string, ReturnType<typeof vi.fn>>,
    assignments: Record<string, ReturnType<typeof vi.fn>>,
    existing: AssetClass[],
    hooks: { classChanged: ReturnType<typeof vi.fn>; classAction: ReturnType<typeof vi.fn> }
): AssetClassApplication {
    return new AssetClassApplication(
        classes as unknown as AssetClassDomain,
        assignments as unknown as ClassAssignmentDomain,
        { listForCompany: vi.fn().mockResolvedValue(existing) } as unknown as ClassReaderService,
        new ClassDisplayNameService(),
        { classChanged: hooks.classChanged } as unknown as AllocationLogService,
        { classAction: hooks.classAction } as unknown as AllocationMetricsService
    );
}

function build(existing: AssetClass[]): Doubles {
    const classes: Record<string, ReturnType<typeof vi.fn>> = {
        create: vi.fn().mockImplementation((input: { name: string }) => Promise.resolve(makeClass({ name: input.name }))),
        update: vi.fn().mockImplementation((id: string) => Promise.resolve(existing.find((item: AssetClass) => item.id === id) ?? null)),
        absorb: vi
            .fn()
            .mockImplementation((input: { destination: AssetClass; targetBps: number }) =>
                Promise.resolve({ ...input.destination, targetBps: input.targetBps })
            ),
        remove: vi.fn().mockResolvedValue(undefined)
    };
    const assignments: Record<string, ReturnType<typeof vi.fn>> = {
        classHasAssignments: vi.fn().mockResolvedValue(false),
        listByClass: vi.fn().mockResolvedValue([]),
        moveAll: vi.fn().mockResolvedValue(undefined),
        applyTargets: vi.fn().mockResolvedValue(undefined)
    };
    const classChanged: ReturnType<typeof vi.fn> = vi.fn();
    const classAction: ReturnType<typeof vi.fn> = vi.fn();
    return {
        application: makeApplication(classes, assignments, existing, { classChanged, classAction }),
        classes,
        assignments,
        classChanged,
        classAction
    };
}

beforeEach(() => {
    TransactionalContext.set({ withTransaction: async <T>(fn: () => Promise<T>): Promise<T> => fn() } as unknown as DatabaseClient);
});

describe('AssetClassApplication.create', () => {
    it('cria a classe e registra log e métrica sem o nome', async () => {
        const doubles: Doubles = build([makeClass({ name: 'Previdência' })]);

        const view: AssetClassView = await doubles.application.create({ name: 'Imóveis' });

        expect(view.name).toBe('Imóveis');
        expect(doubles.classChanged).toHaveBeenCalledWith('created', expect.any(String));
        expect(doubles.classAction).toHaveBeenCalledWith('created');
    });

    it('nome repetido ignorando maiúsculas lança class_name_taken', async () => {
        const doubles: Doubles = build([makeClass({ name: 'Previdência' })]);

        await expect(doubles.application.create({ name: 'previdência' })).rejects.toBeInstanceOf(ClassNameTakenError);
        expect(doubles.classes['create']).not.toHaveBeenCalled();
    });

    it('nome igual ao nome padrão de classe padrão não renomeada lança class_name_taken nos dois idiomas', async () => {
        const doubles: Doubles = build([makeClass({ systemKey: 'fii', name: null })]);

        await expect(doubles.application.create({ name: 'fiis' })).rejects.toBeInstanceOf(ClassNameTakenError);
        await expect(doubles.application.create({ name: 'Brazilian REITs (FIIs)' })).rejects.toBeInstanceOf(ClassNameTakenError);
    });

    it('nome padrão de classe padrão já renomeada fica livre', async () => {
        const doubles: Doubles = build([makeClass({ systemKey: 'fii', name: 'Imóveis' })]);

        await expect(doubles.application.create({ name: 'FIIs' })).resolves.toBeDefined();
    });

    it('a trigésima primeira classe lança class_limit_reached', async () => {
        const full: AssetClass[] = Array.from({ length: 30 }, (_: unknown, index: number) => makeClass({ name: `C${String(index)}` }));
        const doubles: Doubles = build(full);

        await expect(doubles.application.create({ name: 'Nova' })).rejects.toBeInstanceOf(ClassLimitReachedError);
    });
});

describe('AssetClassApplication.update', () => {
    it('renomeia e registra a ação renamed', async () => {
        const current: AssetClass = makeClass({ name: 'Antigo' });
        const doubles: Doubles = build([current]);

        await doubles.application.update(current.id, { name: 'Novo' });

        expect(doubles.classes['update']).toHaveBeenCalledWith(current.id, { name: 'Novo' });
        expect(doubles.classAction).toHaveBeenCalledWith('renamed');
    });

    it('trocar só a cor não conta como renomear', async () => {
        const current: AssetClass = makeClass({ name: 'Antigo' });
        const doubles: Doubles = build([current]);

        await doubles.application.update(current.id, { colorKey: 'c5' });

        expect(doubles.classAction).not.toHaveBeenCalled();
    });

    it('manter o próprio nome trocando maiúsculas é permitido', async () => {
        const current: AssetClass = makeClass({ name: 'antigo' });
        const doubles: Doubles = build([current]);

        await expect(doubles.application.update(current.id, { name: 'Antigo' })).resolves.toBeDefined();
    });

    it('nome de outra classe lança class_name_taken', async () => {
        const current: AssetClass = makeClass({ name: 'A' });
        const doubles: Doubles = build([current, makeClass({ name: 'B' })]);

        await expect(doubles.application.update(current.id, { name: 'b' })).rejects.toBeInstanceOf(ClassNameTakenError);
    });

    it('name null restaura o nome traduzido da classe padrão', async () => {
        const current: AssetClass = makeClass({ systemKey: 'fii', name: 'Imóveis' });
        const doubles: Doubles = build([current]);

        await doubles.application.update(current.id, { name: null });

        expect(doubles.classes['update']).toHaveBeenCalledWith(current.id, { name: null });
    });

    it('name null em classe criada pelo usuário é inválido', async () => {
        const current: AssetClass = makeClass({ name: 'Previdência' });
        const doubles: Doubles = build([current]);

        await expect(doubles.application.update(current.id, { name: null })).rejects.toBeInstanceOf(ClassNameRequiredError);
    });

    it('classe fora da company lança class_not_found', async () => {
        const doubles: Doubles = build([makeClass()]);

        await expect(doubles.application.update('outra', { name: 'X' })).rejects.toBeInstanceOf(ClassNotFoundError);
    });

    it('classe apagada entre a leitura e a gravação lança class_not_found', async () => {
        const current: AssetClass = makeClass();
        const doubles: Doubles = build([current]);
        doubles.classes['update']?.mockResolvedValue(null);

        await expect(doubles.application.update(current.id, { colorKey: 'c2' })).rejects.toBeInstanceOf(ClassNotFoundError);
    });
});

describe('AssetClassApplication.merge', () => {
    it('juntar uma classe nela mesma lança cannot_merge_into_self', async () => {
        const current: AssetClass = makeClass();
        const doubles: Doubles = build([current]);

        await expect(doubles.application.merge(current.id, current.id)).rejects.toBeInstanceOf(CannotMergeIntoSelfError);
    });

    it('origem ou destino inexistentes lançam class_not_found', async () => {
        const current: AssetClass = makeClass();
        const doubles: Doubles = build([current]);

        await expect(doubles.application.merge(current.id, 'outra')).rejects.toBeInstanceOf(ClassNotFoundError);
        await expect(doubles.application.merge('outra', current.id)).rejects.toBeInstanceOf(ClassNotFoundError);
    });

    it('move as atribuições, soma as metas, recompõe os ativos e absorve a origem', async () => {
        const origin: AssetClass = makeClass({ systemKey: 'fii', targetBps: 1000 });
        const destination: AssetClass = makeClass({ systemKey: 'reits', targetBps: 1500 });
        const doubles: Doubles = build([origin, destination]);
        const a: ClassAssignment = makeAssignment({ classId: origin.id, targetInClassBps: 10000 });
        const c: ClassAssignment = makeAssignment({ classId: destination.id, targetInClassBps: 10000 });
        doubles.assignments['listByClass']?.mockImplementation((classId: string) => Promise.resolve(classId === origin.id ? [a] : [c]));

        const view: AssetClassView = await doubles.application.merge(origin.id, destination.id);

        expect(view.id).toBe(destination.id);
        expect(view.targetBps).toBe(2500);
        expect(doubles.assignments['moveAll']).toHaveBeenCalledWith(origin.id, destination.id);
        expect(doubles.assignments['applyTargets']).toHaveBeenCalledWith([
            { assignmentId: a.id, targetInClassBps: 4000 },
            { assignmentId: c.id, targetInClassBps: 6000 }
        ]);
        expect(doubles.classes['absorb']).toHaveBeenCalledWith({ origin, destination, targetBps: 2500 });
        expect(doubles.classAction).toHaveBeenCalledWith('merged');
    });

    it('a meta somada nunca passa de 100%', async () => {
        const origin: AssetClass = makeClass({ targetBps: 7000 });
        const destination: AssetClass = makeClass({ targetBps: 7000 });
        const doubles: Doubles = build([origin, destination]);

        const view: AssetClassView = await doubles.application.merge(origin.id, destination.id);

        expect(view.targetBps).toBe(10000);
    });

    it('devolve o destino anterior se a leitura pós-atualização vier vazia', async () => {
        const origin: AssetClass = makeClass();
        const destination: AssetClass = makeClass();
        const doubles: Doubles = build([origin, destination]);
        doubles.classes['absorb']?.mockResolvedValue(null);

        const view: AssetClassView = await doubles.application.merge(origin.id, destination.id);

        expect(view.id).toBe(destination.id);
    });
});

describe('AssetClassApplication.remove', () => {
    it('exclui classe de usuário vazia', async () => {
        const current: AssetClass = makeClass();
        const doubles: Doubles = build([current]);

        await doubles.application.remove(current.id);

        expect(doubles.classes['remove']).toHaveBeenCalledWith(current.id);
        expect(doubles.classAction).toHaveBeenCalledWith('deleted');
    });

    it('classe com atribuição lança class_not_empty', async () => {
        const current: AssetClass = makeClass();
        const doubles: Doubles = build([current]);
        doubles.assignments['classHasAssignments']?.mockResolvedValue(true);

        await expect(doubles.application.remove(current.id)).rejects.toBeInstanceOf(ClassNotEmptyError);
        expect(doubles.classes['remove']).not.toHaveBeenCalled();
    });

    it('classe padrão não pode ser excluída', async () => {
        const current: AssetClass = makeClass({ systemKey: 'cripto', name: null });
        const doubles: Doubles = build([current]);

        await expect(doubles.application.remove(current.id)).rejects.toBeInstanceOf(SystemClassNotDeletableError);
    });

    it('classe inexistente lança class_not_found', async () => {
        await expect(build([]).application.remove('x')).rejects.toBeInstanceOf(ClassNotFoundError);
    });
});

describe('AssetClassApplication.list', () => {
    it('devolve só os campos públicos', async () => {
        const current: AssetClass = makeClass();

        const [view]: AssetClassView[] = await build([current]).application.list();

        expect(Object.keys(view ?? {}).sort()).toEqual(['aliasKeys', 'colorKey', 'id', 'name', 'sortOrder', 'systemKey', 'targetBps']);
    });
});
