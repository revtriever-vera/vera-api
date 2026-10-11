import { describe, expect, it, vi } from 'vitest';
import { PortfolioSettingsRepository } from '../repositories/portfolio-settings.repository';
import { PortfolioSettingsRow } from './allocation.types';
import { PortfolioSettingsDomain } from './portfolio-settings.domain';

function row(overrides: Partial<PortfolioSettingsRow> = {}): PortfolioSettingsRow {
    return {
        id: 's1',
        companyId: 'company-1',
        baseCurrency: 'BRL',
        toleranceBps: 500,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ...overrides
    };
}

function build(repository: Record<string, ReturnType<typeof vi.fn>>): PortfolioSettingsDomain {
    return new PortfolioSettingsDomain(repository as unknown as PortfolioSettingsRepository);
}

describe('PortfolioSettingsDomain', () => {
    it('cria o padrão quando falta e lê de novo', async () => {
        const created = row();
        const insertDefaultIfMissing = vi.fn();
        const findCurrent = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(created);

        const result = await build({ findCurrent, insertDefaultIfMissing }).ensure();

        expect(insertDefaultIfMissing).toHaveBeenCalledTimes(1);
        expect(result).toBe(created);
    });

    it('não insere quando a linha já existe', async () => {
        const insertDefaultIfMissing = vi.fn();

        await build({ findCurrent: vi.fn().mockResolvedValue(row()), insertDefaultIfMissing }).ensure();

        expect(insertDefaultIfMissing).not.toHaveBeenCalled();
    });

    it('atualiza só quando há campo para mudar', async () => {
        const updated = row({ toleranceBps: 100 });
        const updateFields = vi.fn().mockResolvedValue(updated);
        const domain = build({ findCurrent: vi.fn().mockResolvedValue(row()), updateFields });

        expect(await domain.update({ toleranceBps: 100 })).toBe(updated);
        expect(updateFields).toHaveBeenCalledWith('s1', { toleranceBps: 100 });
        updateFields.mockClear();
        expect((await domain.update({})).toleranceBps).toBe(500);
        expect(updateFields).not.toHaveBeenCalled();
    });
});
