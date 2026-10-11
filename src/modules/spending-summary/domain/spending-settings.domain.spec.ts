import { describe, expect, it, vi } from 'vitest';
import { SpendingSettingsRepository } from '../repositories/spending-settings.repository';
import { SpendingSettingsDomain, toSettingsView } from './spending-settings.domain';
import { DeclaredIncomeRequiredError } from './spending-summary.errors';
import { SpendingSettingsRow } from './spending-summary.types';

function row(overrides: Partial<SpendingSettingsRow> = {}): SpendingSettingsRow {
    return {
        id: 's1',
        companyId: 'company-1',
        savingsGoalBps: 2000,
        incomeMode: 'transactions',
        declaredIncomeMinor: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ...overrides
    };
}

function build(repository: Record<string, ReturnType<typeof vi.fn>>): SpendingSettingsDomain {
    return new SpendingSettingsDomain(repository as unknown as SpendingSettingsRepository);
}

describe('toSettingsView', () => {
    it('converte o bigint em número e normaliza o modo', () => {
        expect(toSettingsView(row({ incomeMode: 'declared', declaredIncomeMinor: '1500000' }))).toEqual({
            savingsGoalBps: 2000,
            incomeMode: 'declared',
            declaredIncomeMinor: 1500000
        });
        expect(toSettingsView(row({ incomeMode: 'outro' })).incomeMode).toBe('transactions');
    });
});

describe('SpendingSettingsDomain', () => {
    it('cria o padrão quando falta e lê de novo', async () => {
        const created = row();
        const insertDefaultIfMissing = vi.fn();
        const findCurrent = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(created);

        const result = await build({ findCurrent, insertDefaultIfMissing }).ensure();

        expect(insertDefaultIfMissing).toHaveBeenCalledTimes(1);
        expect(result).toBe(created);
    });

    it('não insere quando a linha já existe, e current só lê', async () => {
        const insertDefaultIfMissing = vi.fn();
        const findCurrent = vi.fn().mockResolvedValue(row());
        const domain = build({ findCurrent, insertDefaultIfMissing });

        await domain.ensure();
        await domain.current();

        expect(insertDefaultIfMissing).not.toHaveBeenCalled();
    });

    it('grava só o que mudou, mantendo o resto', async () => {
        const updateFields = vi.fn().mockResolvedValue(row({ savingsGoalBps: 3500 }));
        const domain = build({ findCurrent: vi.fn().mockResolvedValue(row()), updateFields });

        await domain.update({ savingsGoalBps: 3500 });

        expect(updateFields).toHaveBeenCalledWith('s1', { savingsGoalBps: 3500, incomeMode: 'transactions', declaredIncomeMinor: null });
    });

    it('o modo declarado exige renda declarada maior que zero', async () => {
        const updateFields = vi.fn();
        const domain = build({ findCurrent: vi.fn().mockResolvedValue(row()), updateFields });

        await expect(domain.update({ incomeMode: 'declared' })).rejects.toBeInstanceOf(DeclaredIncomeRequiredError);
        await expect(domain.update({ incomeMode: 'declared', declaredIncomeMinor: 0 })).rejects.toBeInstanceOf(DeclaredIncomeRequiredError);
        await expect(domain.update({ incomeMode: 'declared', declaredIncomeMinor: null })).rejects.toBeInstanceOf(
            DeclaredIncomeRequiredError
        );
        expect(updateFields).not.toHaveBeenCalled();
    });

    it('a renda declarada fica guardada ao voltar para transações', async () => {
        const updateFields = vi.fn().mockResolvedValue(row());
        const current = row({ incomeMode: 'declared', declaredIncomeMinor: '1500000' });
        const domain = build({ findCurrent: vi.fn().mockResolvedValue(current), updateFields });

        await domain.update({ incomeMode: 'transactions' });

        expect(updateFields).toHaveBeenCalledWith('s1', { savingsGoalBps: 2000, incomeMode: 'transactions', declaredIncomeMinor: 1500000 });
    });

    it('zero fora do modo declarado limpa o valor', async () => {
        const updateFields = vi.fn().mockResolvedValue(row());
        const domain = build({ findCurrent: vi.fn().mockResolvedValue(row()), updateFields });

        await domain.update({ declaredIncomeMinor: 0 });

        expect(updateFields).toHaveBeenCalledWith('s1', { savingsGoalBps: 2000, incomeMode: 'transactions', declaredIncomeMinor: null });
    });

    it('devolve a linha atual se a atualização não achar a linha', async () => {
        const current = row();
        const domain = build({ findCurrent: vi.fn().mockResolvedValue(current), updateFields: vi.fn().mockResolvedValue(null) });

        await expect(domain.update({ savingsGoalBps: 1000 })).resolves.toBe(current);
    });
});
