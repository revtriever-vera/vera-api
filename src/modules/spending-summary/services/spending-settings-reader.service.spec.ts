import { describe, expect, it, vi } from 'vitest';
import { SpendingSettingsDomain } from '../domain/spending-settings.domain';
import { SpendingSettingsReaderService } from './spending-settings-reader.service';

describe('SpendingSettingsReaderService', () => {
    it('lê as preferências garantindo o padrão', async () => {
        const ensure = vi.fn().mockResolvedValue({ savingsGoalBps: 2000, incomeMode: 'declared', declaredIncomeMinor: '900000' });

        const result = await new SpendingSettingsReaderService({ ensure } as unknown as SpendingSettingsDomain).get();

        expect(result).toEqual({ savingsGoalBps: 2000, incomeMode: 'declared', declaredIncomeMinor: 900000 });
    });
});
