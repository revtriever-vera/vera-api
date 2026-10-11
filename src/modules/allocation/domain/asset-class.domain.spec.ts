import { describe, expect, it, vi } from 'vitest';
import { makeClass } from '../../../../test/support/allocation-factories';
import { AssetClassesRepository } from '../repositories/asset-classes.repository';
import { AssetClassDomain } from './asset-class.domain';
import { ClassNameTakenError } from './allocation.errors';

function build(repository: Record<string, ReturnType<typeof vi.fn>>): AssetClassDomain {
    return new AssetClassDomain(repository as unknown as AssetClassesRepository);
}

describe('AssetClassDomain.ensureDefaults', () => {
    it('não escreve quando as oito classes padrão já existem, mesmo apagadas', async () => {
        const insertSeedsIfMissing: ReturnType<typeof vi.fn> = vi.fn();
        const domain: AssetClassDomain = build({ countSeededIncludingDeleted: vi.fn().mockResolvedValue(8), insertSeedsIfMissing });

        await expect(domain.ensureDefaults()).resolves.toEqual([]);
        expect(insertSeedsIfMissing).not.toHaveBeenCalled();
    });

    it('semeia com as metas iniciais somando 100%', async () => {
        const insertSeedsIfMissing: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([makeClass()]);
        const domain: AssetClassDomain = build({ countSeededIncludingDeleted: vi.fn().mockResolvedValue(0), insertSeedsIfMissing });

        await domain.ensureDefaults();

        const seeds: { targetBps: number; colorKey: string; sortOrder: number }[] = insertSeedsIfMissing.mock.calls[0]?.[0] as never;
        expect(seeds).toHaveLength(8);
        expect(seeds.reduce((acc: number, seed: { targetBps: number }) => acc + seed.targetBps, 0)).toBe(10000);
        expect(seeds.map((seed: { colorKey: string }) => seed.colorKey)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']);
    });
});

describe('AssetClassDomain.create', () => {
    it('usa a próxima ordem e a menor cor livre', async () => {
        const create: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(makeClass());
        const existing = [makeClass({ sortOrder: 4, colorKey: 'c1' }), makeClass({ sortOrder: 9, colorKey: 'c2' })];

        await build({ create }).create({ name: 'Previdência' }, existing);

        expect(create).toHaveBeenCalledWith({ name: 'Previdência', colorKey: 'c3', sortOrder: 10 });
    });

    it('respeita a cor escolhida', async () => {
        const create: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(makeClass());

        await build({ create }).create({ name: 'X', colorKey: 'c9' }, []);

        expect(create).toHaveBeenCalledWith({ name: 'X', colorKey: 'c9', sortOrder: 1 });
    });

    it('violação do índice único de nome vira class_name_taken', async () => {
        const create: ReturnType<typeof vi.fn> = vi.fn().mockRejectedValue({ code: '23505' });

        await expect(build({ create }).create({ name: 'X' }, [])).rejects.toBeInstanceOf(ClassNameTakenError);
    });

    it('outros erros passam adiante', async () => {
        const failure: Error = new Error('boom');
        const create: ReturnType<typeof vi.fn> = vi.fn().mockRejectedValue(failure);

        await expect(build({ create }).create({ name: 'X' }, [])).rejects.toBe(failure);
    });
});

describe('AssetClassDomain.absorb', () => {
    it('acumula as chaves da origem (inclusive a própria) sem duplicar e remove a origem', async () => {
        const updateFields: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(makeClass());
        const softDelete: ReturnType<typeof vi.fn> = vi.fn();
        const origin = makeClass({ systemKey: 'fii', aliasKeys: ['rf_pre'] });
        const destination = makeClass({ systemKey: 'reits', aliasKeys: ['rf_pre'] });

        await build({ updateFields, softDelete }).absorb({ origin, destination, targetBps: 1500 });

        expect(updateFields).toHaveBeenCalledWith(destination.id, { targetBps: 1500, aliasKeys: ['rf_pre', 'fii'] });
        expect(softDelete).toHaveBeenCalledWith(origin.id);
    });

    it('origem criada pelo usuário não acrescenta chave própria', async () => {
        const updateFields: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(makeClass());
        const origin = makeClass({ systemKey: null });
        const destination = makeClass({ systemKey: 'reits' });

        await build({ updateFields, softDelete: vi.fn() }).absorb({ origin, destination, targetBps: 0 });

        expect(updateFields).toHaveBeenCalledWith(destination.id, { targetBps: 0, aliasKeys: [] });
    });
});

describe('AssetClassDomain delegations', () => {
    it('lista, busca, atualiza e remove pelo repositório', async () => {
        const row = makeClass();
        const repository: Record<string, ReturnType<typeof vi.fn>> = {
            listOrdered: vi.fn().mockResolvedValue([row]),
            findById: vi.fn().mockResolvedValue(row),
            updateFields: vi.fn().mockResolvedValue(row),
            softDelete: vi.fn()
        };
        const domain: AssetClassDomain = build(repository);

        await expect(domain.listActive()).resolves.toEqual([row]);
        await expect(domain.findById(row.id)).resolves.toBe(row);
        await expect(domain.update(row.id, { name: 'N', colorKey: 'c2' })).resolves.toBe(row);
        await domain.remove(row.id);
        expect(repository['softDelete']).toHaveBeenCalledWith(row.id);
    });
});
