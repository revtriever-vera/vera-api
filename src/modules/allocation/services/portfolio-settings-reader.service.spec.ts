import { describe, expect, it, vi } from 'vitest';
import { PortfolioSettingsDomain } from '../domain/portfolio-settings.domain';
import { PortfolioSettingsReaderService } from './portfolio-settings-reader.service';

describe('PortfolioSettingsReaderService', () => {
    it('devolve só moeda base e tolerância, sem campos internos', async () => {
        const ensure = vi.fn().mockResolvedValue({ id: 's1', companyId: 'c1', baseCurrency: 'USD', toleranceBps: 250 });

        const view = await new PortfolioSettingsReaderService({ ensure } as unknown as PortfolioSettingsDomain).get();

        expect(view).toEqual({ baseCurrency: 'USD', toleranceBps: 250 });
    });
});
