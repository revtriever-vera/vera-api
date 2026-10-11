import { Injectable } from '@nestjs/common';
import { PortfolioSettingsRepository, UpdateSettingsData } from '../repositories/portfolio-settings.repository';
import { PortfolioSettingsRow } from './allocation.types';

@Injectable()
export class PortfolioSettingsDomain {
    public constructor(private readonly settings: PortfolioSettingsRepository) {}

    public async current(): Promise<PortfolioSettingsRow | null> {
        return this.settings.findCurrent();
    }

    public async ensure(): Promise<PortfolioSettingsRow> {
        const current: PortfolioSettingsRow | null = await this.settings.findCurrent();
        if (current !== null) {
            return current;
        }
        await this.settings.insertDefaultIfMissing();
        return (await this.settings.findCurrent()) as PortfolioSettingsRow;
    }

    public async update(data: UpdateSettingsData): Promise<PortfolioSettingsRow> {
        const current: PortfolioSettingsRow = await this.ensure();
        if (data.baseCurrency === undefined && data.toleranceBps === undefined) {
            return current;
        }
        return (await this.settings.updateFields(current.id, data)) ?? current;
    }
}
