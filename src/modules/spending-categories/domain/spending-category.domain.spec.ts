import { describe, expect, it, vi } from 'vitest';
import { makeCategory } from '../../../../test/support/spending-factories';
import { SpendingCategoriesRepository } from '../repositories/spending-categories.repository';
import { CategoryLimitReachedError, CategoryNameTakenError } from './categories.errors';
import { SpendingCategoryDomain } from './spending-category.domain';
import { SYSTEM_CATEGORIES } from './system-categories';

function build(repository: Record<string, ReturnType<typeof vi.fn>>): SpendingCategoryDomain {
    return new SpendingCategoryDomain(repository as unknown as SpendingCategoriesRepository);
}

const UNIQUE_VIOLATION: object = { code: '23505', constraint: 'SpendingCategories_companyId_name_unique' };

describe('SpendingCategoryDomain.ensureDefaults', () => {
    it('não escreve quando as 17 padrão já existem', async () => {
        const insertSeedsIfMissing: ReturnType<typeof vi.fn> = vi.fn();
        const seeded = SYSTEM_CATEGORIES.map((seed) => makeCategory({ systemKey: seed.systemKey }));
        const domain: SpendingCategoryDomain = build({
            listOrdered: vi.fn().mockResolvedValue([...seeded, makeCategory()]),
            insertSeedsIfMissing
        });

        await expect(domain.ensureDefaults()).resolves.toEqual([]);
        expect(insertSeedsIfMissing).not.toHaveBeenCalled();
    });

    it('semeia as 17 com natureza, flexibilidade e ícone da tabela do card', async () => {
        const insertSeedsIfMissing: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([makeCategory()]);
        const domain: SpendingCategoryDomain = build({ listOrdered: vi.fn().mockResolvedValue([]), insertSeedsIfMissing });

        await domain.ensureDefaults();

        expect(insertSeedsIfMissing).toHaveBeenCalledWith(SYSTEM_CATEGORIES);
        expect(SYSTEM_CATEGORIES).toHaveLength(17);
        expect(
            SYSTEM_CATEGORIES.filter((seed) => seed.kind === 'expense' && seed.flexibility === 'fixed').map((seed) => seed.systemKey)
        ).toEqual(['housing', 'education', 'health', 'home_services', 'taxes_fees']);
        expect(SYSTEM_CATEGORIES.every((seed) => (seed.kind === 'expense') === (seed.flexibility !== null))).toBe(true);
    });
});

describe('SpendingCategoryDomain.create', () => {
    it('usa a próxima posição e guarda a flexibilidade da despesa', async () => {
        const create: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(makeCategory());
        const existing = [makeCategory({ position: 4 }), makeCategory({ position: 17, systemKey: 'income' })];

        await build({ create }).create({ name: 'Pets', kind: 'expense', flexibility: 'fixed', icon: 'PawPrint' }, existing);

        expect(create).toHaveBeenCalledWith({ name: 'Pets', kind: 'expense', flexibility: 'fixed', icon: 'PawPrint', position: 18 });
    });

    it('descarta a flexibilidade de uma categoria de renda', async () => {
        const create: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(makeCategory());

        await build({ create }).create({ name: 'Bico', kind: 'income', flexibility: 'fixed', icon: 'Briefcase' }, []);

        expect(create).toHaveBeenCalledWith(expect.objectContaining({ flexibility: null, position: 1 }));
    });

    it('recusa a 51ª categoria do usuário, sem contar as padrão', async () => {
        const create: ReturnType<typeof vi.fn> = vi.fn();
        const system = SYSTEM_CATEGORIES.map((seed) => makeCategory({ systemKey: seed.systemKey }));
        const own = Array.from({ length: 50 }, () => makeCategory());

        await expect(
            build({ create }).create({ name: 'X', kind: 'expense', flexibility: 'fixed', icon: 'Home' }, [...system, ...own])
        ).rejects.toBeInstanceOf(CategoryLimitReachedError);
        await build({ create: vi.fn().mockResolvedValue(makeCategory()) }).create(
            { name: 'X', kind: 'expense', flexibility: 'fixed', icon: 'Home' },
            [...system, ...own.slice(1)]
        );
        expect(create).not.toHaveBeenCalled();
    });

    it('traduz a violação de unicidade em nome já usado', async () => {
        const create: ReturnType<typeof vi.fn> = vi.fn().mockRejectedValue(UNIQUE_VIOLATION);

        await expect(build({ create }).create({ name: 'X', kind: 'income', flexibility: null, icon: 'Home' }, [])).rejects.toBeInstanceOf(
            CategoryNameTakenError
        );
    });

    it('deixa passar outros erros', async () => {
        const boom: Error = new Error('boom');

        await expect(
            build({ create: vi.fn().mockRejectedValue(boom) }).create({ name: 'X', kind: 'income', flexibility: null, icon: 'Home' }, [])
        ).rejects.toBe(boom);
        await expect(
            build({ create: vi.fn().mockRejectedValue('string-error') }).create(
                { name: 'X', kind: 'income', flexibility: null, icon: 'Home' },
                []
            )
        ).rejects.toBe('string-error');
    });
});

describe('SpendingCategoryDomain.update e remove', () => {
    it('atualiza campos e traduz nome repetido', async () => {
        const updateFields: ReturnType<typeof vi.fn> = vi
            .fn()
            .mockResolvedValueOnce(makeCategory({ id: 'c1' }))
            .mockRejectedValueOnce(UNIQUE_VIOLATION);
        const domain: SpendingCategoryDomain = build({ updateFields });

        await expect(domain.update('c1', { name: 'Novo' })).resolves.toMatchObject({ id: 'c1' });
        await expect(domain.update('c1', { name: 'Repetido' })).rejects.toBeInstanceOf(CategoryNameTakenError);
    });

    it('lista, remove e devolve as ativas', async () => {
        const softDelete: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
        const domain: SpendingCategoryDomain = build({ softDelete, listOrdered: vi.fn().mockResolvedValue([makeCategory()]) });

        await domain.remove('c1');

        expect(softDelete).toHaveBeenCalledWith('c1');
        await expect(domain.listActive()).resolves.toHaveLength(1);
    });
});
