import { describe, expect, it, vi } from 'vitest';
import { SpendingSettingsDomain } from '../domain/spending-settings.domain';
import { SpendingSettingsReaderService } from '../services/spending-settings-reader.service';
import { SpendingSummaryLogService } from '../services/spending-summary-log.service';
import { SettingsApplication } from './settings.application';

describe('SettingsApplication', () => {
    it('lê pelo service de leitura', async () => {
        const get = vi.fn().mockResolvedValue({ savingsGoalBps: 2000, incomeMode: 'transactions', declaredIncomeMinor: null });
        const application = new SettingsApplication(
            {} as unknown as SpendingSettingsDomain,
            { get } as unknown as SpendingSettingsReaderService,
            {} as unknown as SpendingSummaryLogService
        );

        expect(await application.get()).toEqual({ savingsGoalBps: 2000, incomeMode: 'transactions', declaredIncomeMinor: null });
    });

    it('grava e registra só o modo de renda', async () => {
        const update = vi.fn().mockResolvedValue({
            id: 's1',
            companyId: 'c1',
            savingsGoalBps: 3500,
            incomeMode: 'transactions',
            declaredIncomeMinor: null
        });
        const settingsUpdated = vi.fn();
        const application = new SettingsApplication(
            { update } as unknown as SpendingSettingsDomain,
            {} as unknown as SpendingSettingsReaderService,
            { settingsUpdated } as unknown as SpendingSummaryLogService
        );

        const result = await application.update({ savingsGoalBps: 3500 });

        expect(update).toHaveBeenCalledWith({ savingsGoalBps: 3500 });
        expect(result.savingsGoalBps).toBe(3500);
        expect(settingsUpdated).toHaveBeenCalledWith('transactions');
    });
});
