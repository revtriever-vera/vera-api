import { describe, expect, it, vi } from 'vitest';
import { CompaniesRepository } from '../repositories/companies.repository';
import { CompanyDomain } from './company.domain';
import { AccountClosedError, AccountModulesEmptyError } from './identity.errors';

interface ModulesDoubles {
    readonly domain: CompanyDomain;
    readonly updateModules: ReturnType<typeof vi.fn>;
}

function modulesDoubles(locked: { portfolioModuleEnabled: boolean; spendingModuleEnabled: boolean } | null): ModulesDoubles {
    const updateModules: ReturnType<typeof vi.fn> = vi.fn((_id: string, data: Record<string, boolean>) =>
        Promise.resolve({ ...locked, ...data })
    );
    const lockById: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(locked);
    const domain: CompanyDomain = new CompanyDomain({ lockById, updateModules } as unknown as CompaniesRepository);
    return { domain, updateModules };
}

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

    it('desliga um módulo e mantém o outro como estava', async () => {
        const doubles: ModulesDoubles = modulesDoubles({ portfolioModuleEnabled: true, spendingModuleEnabled: true });

        await expect(doubles.domain.updateModules('company-1', { spending: false })).resolves.toEqual({ portfolio: true, spending: false });
        expect(doubles.updateModules).toHaveBeenCalledWith('company-1', { portfolioModuleEnabled: true, spendingModuleEnabled: false });
    });

    it('recusa deixar os dois módulos desligados, sem gravar', async () => {
        const doubles: ModulesDoubles = modulesDoubles({ portfolioModuleEnabled: false, spendingModuleEnabled: true });

        await expect(doubles.domain.updateModules('company-1', { spending: false })).rejects.toBeInstanceOf(AccountModulesEmptyError);
        expect(doubles.updateModules).not.toHaveBeenCalled();
    });

    it('troca um módulo pelo outro na mesma chamada', async () => {
        const doubles: ModulesDoubles = modulesDoubles({ portfolioModuleEnabled: false, spendingModuleEnabled: true });

        await expect(doubles.domain.updateModules('company-1', { portfolio: true, spending: false })).resolves.toEqual({
            portfolio: true,
            spending: false
        });
    });

    it('lança account_closed quando a company não existe mais', async () => {
        const doubles: ModulesDoubles = modulesDoubles(null);

        await expect(doubles.domain.updateModules('company-1', { portfolio: true })).rejects.toBeInstanceOf(AccountClosedError);
    });
});
