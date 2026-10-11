import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCategory, makeRule } from '../../../../test/support/spending-factories';
import { DatabaseClient } from '../../../core/database/database.client';
import { TransactionalContext } from '../../../core/database/using-transaction.decorator';
import {
    CategoryKindMismatchError,
    CategoryNameRequiredError,
    CategoryNotFoundError,
    FlexibilityNotApplicableError,
    SystemCategoryLockedError
} from '../domain/categories.errors';
import { CategoryView, SpendingCategory } from '../domain/categories.types';
import { CategoryRuleDomain } from '../domain/category-rule.domain';
import { SpendingCategoryDomain } from '../domain/spending-category.domain';
import { CategoryReaderService } from '../services/category-reader.service';
import { RecategorizationRegistry } from '../services/recategorization.registry';
import { SpendingCategoriesLogService } from '../services/spending-categories-log.service';
import { SpendingCategoriesMetricsService } from '../services/spending-categories-metrics.service';
import { CategoryApplication } from './category.application';

const HOUSING: SpendingCategory = makeCategory({
    id: 'housing',
    systemKey: 'housing',
    name: null,
    kind: 'expense',
    flexibility: 'fixed',
    icon: 'Home'
});
const INCOME: SpendingCategory = makeCategory({
    id: 'income',
    systemKey: 'income',
    name: null,
    kind: 'income',
    flexibility: null,
    icon: 'TrendingUp'
});
const PETS: SpendingCategory = makeCategory({ id: 'pets', name: 'Pets', kind: 'expense', flexibility: 'flexible', icon: 'PawPrint' });
const GIFTS: SpendingCategory = makeCategory({ id: 'gifts', name: 'Presentes', kind: 'expense', flexibility: 'flexible', icon: 'Gift' });
const BICO: SpendingCategory = makeCategory({ id: 'bico', name: 'Bico', kind: 'income', flexibility: null, icon: 'Briefcase' });

interface Built {
    readonly application: CategoryApplication;
    readonly categories: Record<string, ReturnType<typeof vi.fn>>;
    readonly rules: Record<string, ReturnType<typeof vi.fn>>;
    readonly recategorize: ReturnType<typeof vi.fn>;
    readonly categoryWritten: ReturnType<typeof vi.fn>;
    readonly ruleAction: ReturnType<typeof vi.fn>;
}

function build(existing: SpendingCategory[] = [HOUSING, INCOME, PETS, GIFTS, BICO]): Built {
    const categories: Record<string, ReturnType<typeof vi.fn>> = {
        create: vi.fn().mockImplementation((input: object) => Promise.resolve(makeCategory({ id: 'created', ...input }))),
        update: vi
            .fn()
            .mockImplementation((id: string, input: object) =>
                Promise.resolve(
                    id === 'vanished' ? null : { ...(existing.find((item: SpendingCategory) => item.id === id) ?? HOUSING), ...input }
                )
            ),
        remove: vi.fn().mockResolvedValue(undefined)
    };
    const rules: Record<string, ReturnType<typeof vi.fn>> = {
        removeByCategory: vi.fn().mockResolvedValue([makeRule({ matchType: 'contains' }), makeRule({ matchType: 'description' })])
    };
    const recategorize: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(9);
    const categoryWritten: ReturnType<typeof vi.fn> = vi.fn();
    const ruleAction: ReturnType<typeof vi.fn> = vi.fn();
    const reader: CategoryReaderService = {
        listForCompany: vi.fn().mockResolvedValue(existing),
        requireById: vi.fn().mockImplementation((id: string) => {
            const found: SpendingCategory | undefined =
                existing.find((item: SpendingCategory) => item.id === id) ?? (id === 'vanished' ? HOUSING : undefined);
            return found === undefined ? Promise.reject(new CategoryNotFoundError(id)) : Promise.resolve(found);
        })
    } as unknown as CategoryReaderService;
    const application: CategoryApplication = new CategoryApplication(
        categories as unknown as SpendingCategoryDomain,
        rules as unknown as CategoryRuleDomain,
        reader,
        { recategorize } as unknown as RecategorizationRegistry,
        { categoryWritten } as unknown as SpendingCategoriesLogService,
        { ruleAction } as unknown as SpendingCategoriesMetricsService
    );
    return { application, categories, rules, recategorize, categoryWritten, ruleAction };
}

beforeEach(() => {
    TransactionalContext.set({ withTransaction: async <T>(fn: () => Promise<T>): Promise<T> => fn() } as unknown as DatabaseClient);
});

describe('CategoryApplication.list e create', () => {
    it('lista com a visão pública', async () => {
        const views: CategoryView[] = await build().application.list();

        expect(views[0]).toMatchObject({ id: 'housing', isSystem: true, flexibility: 'fixed' });
        expect(views[2]).toMatchObject({ id: 'pets', isSystem: false, name: 'Pets' });
    });

    it('cria despesa com flexibilidade e renda sem ela, registrando só ids no log', async () => {
        const built: Built = build();

        const expense: CategoryView = await built.application.create({
            name: 'Viagens',
            kind: 'expense',
            flexibility: 'flexible',
            icon: 'Plane'
        });
        await built.application.create({ name: 'Bico', kind: 'income', icon: 'Briefcase' });

        expect(expense).toMatchObject({ id: 'created', kind: 'expense' });
        expect(built.categories['create']?.mock.calls[0]?.[0]).toEqual({
            name: 'Viagens',
            kind: 'expense',
            flexibility: 'flexible',
            icon: 'Plane'
        });
        expect(built.categories['create']?.mock.calls[1]?.[0]).toMatchObject({ flexibility: null });
        expect(built.categoryWritten).toHaveBeenCalledWith('created', 'created', 0);
    });
});

describe('CategoryApplication.update', () => {
    it('padrão pode ser renomeada, voltar ao nome traduzido e trocar a flexibilidade', async () => {
        const built: Built = build();

        await built.application.update('housing', { name: 'Casa' });
        await built.application.update('housing', { name: null });
        const flexible: CategoryView = await built.application.update('housing', { flexibility: 'flexible' });

        expect(flexible.flexibility).toBe('flexible');
        expect(built.categoryWritten).toHaveBeenCalledWith('housing', 'renamed', 0);
        expect(built.categoryWritten).toHaveBeenCalledWith('housing', 'flexibility_changed', 0);
    });

    it('padrão não troca de ícone', async () => {
        await expect(build().application.update('housing', { icon: 'Car' })).rejects.toBeInstanceOf(SystemCategoryLockedError);
    });

    it('categoria do usuário troca de ícone mas não volta ao nome traduzido', async () => {
        const built: Built = build();

        await expect(built.application.update('pets', { icon: 'Gift' })).resolves.toMatchObject({ icon: 'Gift' });
        await expect(built.application.update('pets', { name: null })).rejects.toBeInstanceOf(CategoryNameRequiredError);
    });

    it('flexibilidade só existe em despesa', async () => {
        await expect(build().application.update('bico', { flexibility: 'fixed' })).rejects.toBeInstanceOf(FlexibilityNotApplicableError);
        await expect(build().application.update('income', { flexibility: 'fixed' })).rejects.toBeInstanceOf(FlexibilityNotApplicableError);
    });

    it('não registra troca de flexibilidade quando o valor é o mesmo', async () => {
        const built: Built = build();

        await built.application.update('pets', { flexibility: 'flexible' });

        expect(built.categoryWritten).not.toHaveBeenCalled();
    });

    it('404 para categoria inexistente ou que sumiu entre a leitura e a escrita', async () => {
        await expect(build().application.update('nope', { name: 'X' })).rejects.toBeInstanceOf(CategoryNotFoundError);
        await expect(build().application.update('vanished', { name: 'X' })).rejects.toBeInstanceOf(CategoryNotFoundError);
    });
});

describe('CategoryApplication.remove', () => {
    it('padrão não é excluída', async () => {
        const built: Built = build();

        await expect(built.application.remove('housing', undefined)).rejects.toBeInstanceOf(SystemCategoryLockedError);
        expect(built.categories['remove']).not.toHaveBeenCalled();
    });

    it('exclui, apaga as regras dela e recategoriza pelo pipeline quando não há destino', async () => {
        const built: Built = build();

        await expect(built.application.remove('pets', undefined)).resolves.toEqual({ recategorized: 9 });

        expect(built.categories['remove']).toHaveBeenCalledWith('pets');
        expect(built.rules['removeByCategory']).toHaveBeenCalledWith('pets');
        expect(built.recategorize).toHaveBeenCalledWith({ kind: 'category_removed', categoryId: 'pets', moveToCategoryId: null });
        expect(built.ruleAction).toHaveBeenCalledTimes(2);
        expect(built.categoryWritten).toHaveBeenCalledWith('pets', 'removed', 9);
    });

    it('move para o destino da mesma natureza', async () => {
        const built: Built = build();

        await built.application.remove('pets', 'gifts');

        expect(built.recategorize).toHaveBeenCalledWith({ kind: 'category_removed', categoryId: 'pets', moveToCategoryId: 'gifts' });
    });

    it('recusa destino de outra natureza, o próprio id e destino inexistente, sem gravar nada', async () => {
        const built: Built = build();

        await expect(built.application.remove('pets', 'bico')).rejects.toBeInstanceOf(CategoryKindMismatchError);
        await expect(built.application.remove('pets', 'pets')).rejects.toBeInstanceOf(CategoryNotFoundError);
        await expect(built.application.remove('pets', 'nope')).rejects.toBeInstanceOf(CategoryNotFoundError);
        expect(built.categories['remove']).not.toHaveBeenCalled();
    });
});
