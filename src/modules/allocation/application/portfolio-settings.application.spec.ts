import { describe, expect, it, vi } from 'vitest';
import { PortfolioSettingsRow } from '../domain/allocation.types';
import { PortfolioSettingsDomain } from '../domain/portfolio-settings.domain';
import { AllocationLogService } from '../services/allocation-log.service';
import { PortfolioSettingsReaderService } from '../services/portfolio-settings-reader.service';
import { PortfolioSettingsApplication } from './portfolio-settings.application';

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

describe('PortfolioSettingsApplication', () => {
    it('lê o padrão BRL e 500 pelo service de leitura', async () => {
        const get = vi.fn().mockResolvedValue({ baseCurrency: 'BRL', toleranceBps: 500 });
        const application = new PortfolioSettingsApplication(
            {} as unknown as PortfolioSettingsDomain,
            { get } as unknown as PortfolioSettingsReaderService,
            {} as unknown as AllocationLogService
        );

        expect(await application.get()).toEqual({ baseCurrency: 'BRL', toleranceBps: 500 });
    });

    it('grava e registra moeda e tolerância no log', async () => {
        const update = vi.fn().mockResolvedValue(row({ baseCurrency: 'USD', toleranceBps: 300 }));
        const settingsChanged = vi.fn();
        const application = new PortfolioSettingsApplication(
            { update } as unknown as PortfolioSettingsDomain,
            {} as unknown as PortfolioSettingsReaderService,
            { settingsChanged } as unknown as AllocationLogService
        );

        const view = await application.update({ baseCurrency: 'USD', toleranceBps: 300 });

        expect(update).toHaveBeenCalledWith({ baseCurrency: 'USD', toleranceBps: 300 });
        expect(view).toEqual({ baseCurrency: 'USD', toleranceBps: 300 });
        expect(settingsChanged).toHaveBeenCalledWith('USD', 300);
    });
});
