import { describe, expect, it, vi } from 'vitest';
import { CompaniesRepository } from '../repositories/companies.repository';
import { CompanyDomain } from './company.domain';

describe('CompanyDomain', () => {
    it('cria a company com nome e idioma', async () => {
        const create: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ id: 'company-1' });
        const domain: CompanyDomain = new CompanyDomain({ create } as unknown as CompaniesRepository);

        await domain.create({ name: 'Ana', locale: 'en' });

        expect(create).toHaveBeenCalledWith({ name: 'Ana', locale: 'en' });
    });

    it('delega a busca por id', async () => {
        const findById: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ id: 'company-1' });
        const domain: CompanyDomain = new CompanyDomain({ findById } as unknown as CompaniesRepository);

        await expect(domain.findById('company-1')).resolves.toEqual({ id: 'company-1' });
    });

    it('apaga a company fisicamente pelo id', async () => {
        const hardDeleteById: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(true);
        const domain: CompanyDomain = new CompanyDomain({ hardDeleteById } as unknown as CompaniesRepository);

        await expect(domain.eraseCompany('company-1')).resolves.toBe(true);
        expect(hardDeleteById).toHaveBeenCalledWith('company-1');
    });
});
