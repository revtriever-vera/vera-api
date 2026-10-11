import { describe, expect, it, vi } from 'vitest';
import { FixedIncomeTitlesRepository } from '../repositories/fixed-income-titles.repository';
import { FixedIncomeTitleRow } from './fixed-income.types';
import { FixedIncomeTitleDomain } from './fixed-income-title.domain';

const DRAFT = {
    kind: 'lca' as const,
    name: 'LCA',
    indexer: 'prefixed' as const,
    rateBps: 1100,
    currency: 'BRL' as const,
    appliedMinor: 500_000,
    appliedAt: '2025-01-06',
    maturityDate: '2027-01-06'
};

function row(overrides: Partial<FixedIncomeTitleRow> = {}): FixedIncomeTitleRow {
    return {
        id: 'a',
        companyId: 'c',
        ...DRAFT,
        appliedMinor: '500000',
        appliedAt: new Date(2025, 0, 6),
        maturityDate: new Date(2027, 0, 6),
        taxRegime: 'exempt',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ...overrides
    };
}

function build() {
    const repository = {
        insert: vi.fn().mockResolvedValue(row()),
        findById: vi.fn().mockResolvedValue(row()),
        listAll: vi.fn().mockResolvedValue([row(), row({ id: 'b' })]),
        countActive: vi.fn().mockResolvedValue(2),
        patch: vi.fn().mockResolvedValue(row({ rateBps: 1200 })),
        softDelete: vi.fn().mockResolvedValue(row())
    };
    return { domain: new FixedIncomeTitleDomain(repository as unknown as FixedIncomeTitlesRepository), repository };
}

describe('FixedIncomeTitleDomain', () => {
    it('deriva o regime de imposto do tipo na criação e na edição', async () => {
        const { domain, repository } = build();

        const created = await domain.create(DRAFT);
        await domain.update('a', { ...DRAFT, kind: 'cdb' });

        expect(repository.insert).toHaveBeenCalledWith({ ...DRAFT, taxRegime: 'exempt' });
        expect(repository.patch).toHaveBeenCalledWith('a', { ...DRAFT, kind: 'cdb', taxRegime: 'regressive' });
        expect(created).toMatchObject({ appliedMinor: 500000, appliedAt: '2025-01-06', taxRegime: 'exempt' });
    });

    it('lê, lista e conta', async () => {
        const { domain } = build();

        expect((await domain.findById('a'))?.id).toBe('a');
        expect(await domain.listAll()).toHaveLength(2);
        expect(await domain.count()).toBe(2);
    });

    it('devolve null/false quando não há linha', async () => {
        const { domain, repository } = build();
        repository.findById.mockResolvedValue(null);
        repository.patch.mockResolvedValue(null);
        repository.softDelete.mockResolvedValue(null);

        expect(await domain.findById('x')).toBeNull();
        expect(await domain.update('x', DRAFT)).toBeNull();
        expect(await domain.remove('x')).toBe(false);
    });

    it('remove devolve true quando apagou', async () => {
        const { domain } = build();

        expect(await domain.remove('a')).toBe(true);
    });
});
