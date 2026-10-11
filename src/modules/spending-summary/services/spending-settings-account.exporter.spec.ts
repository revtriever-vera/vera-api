import { describe, expect, it, vi } from 'vitest';
import { SpendingSettingsDomain } from '../domain/spending-settings.domain';
import { SpendingSettingsRow } from '../domain/spending-summary.types';
import { SpendingSettingsAccountExporter } from './spending-settings-account.exporter';

function build(row: SpendingSettingsRow | null): SpendingSettingsAccountExporter {
    return new SpendingSettingsAccountExporter({ current: vi.fn().mockResolvedValue(row) } as unknown as SpendingSettingsDomain);
}

describe('SpendingSettingsAccountExporter', () => {
    it('exporta meta, modo e renda declarada sem identificadores', async () => {
        const exporter: SpendingSettingsAccountExporter = build({
            id: 'settings-1',
            companyId: 'company-1',
            savingsGoalBps: 2000,
            incomeMode: 'declared',
            declaredIncomeMinor: '1500000',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null
        });

        const exported = await exporter.exportAll();

        expect(exporter.area).toBe('spending_settings');
        expect(exported).toEqual({ savingsGoalBps: 2000, incomeMode: 'declared', declaredIncomeMinor: 1_500_000 });
    });

    it('devolve null quando a pessoa nunca configurou', async () => {
        await expect(build(null).exportAll()).resolves.toBeNull();
    });
});
