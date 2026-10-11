import { describe, expect, it, vi } from 'vitest';
import { makeCategory } from '../../../../test/support/spending-factories';
import { CategoryNotFoundError } from '../domain/categories.errors';
import { SpendingCategoryDomain } from '../domain/spending-category.domain';
import { CategoryReaderService } from './category-reader.service';

function build(): { service: CategoryReaderService; ensureDefaults: ReturnType<typeof vi.fn> } {
    const ensureDefaults: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([]);
    const domain: SpendingCategoryDomain = {
        ensureDefaults,
        listActive: vi.fn().mockResolvedValue([makeCategory({ id: 'c1' })])
    } as unknown as SpendingCategoryDomain;
    return { service: new CategoryReaderService(domain), ensureDefaults };
}

describe('CategoryReaderService', () => {
    it('semeia as padrão antes de listar', async () => {
        const { service, ensureDefaults } = build();

        await expect(service.listForCompany()).resolves.toHaveLength(1);
        expect(ensureDefaults).toHaveBeenCalledTimes(1);
    });

    it('requireById devolve a categoria ou lança 404', async () => {
        const { service } = build();

        await expect(service.requireById('c1')).resolves.toMatchObject({ id: 'c1' });
        await expect(service.requireById('missing')).rejects.toBeInstanceOf(CategoryNotFoundError);
    });
});
