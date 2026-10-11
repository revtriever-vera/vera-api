import { Injectable } from '@nestjs/common';
import { toPortfolioSettingsView } from '../domain/asset-class.mapper';
import { PortfolioSettingsRow, PortfolioSettingsView } from '../domain/allocation.types';
import { PortfolioSettingsDomain } from '../domain/portfolio-settings.domain';
import { AllocationLogService } from '../services/allocation-log.service';
import { PortfolioSettingsReaderService } from '../services/portfolio-settings-reader.service';

export interface UpdateSettingsPayload {
    readonly baseCurrency?: PortfolioSettingsView['baseCurrency'];
    readonly toleranceBps?: number;
}

@Injectable()
export class PortfolioSettingsApplication {
    public constructor(
        private readonly settings: PortfolioSettingsDomain,
        private readonly reader: PortfolioSettingsReaderService,
        private readonly logs: AllocationLogService
    ) {}

    public async get(): Promise<PortfolioSettingsView> {
        return this.reader.get();
    }

    public async update(payload: UpdateSettingsPayload): Promise<PortfolioSettingsView> {
        const updated: PortfolioSettingsRow = await this.settings.update(payload);
        const view: PortfolioSettingsView = toPortfolioSettingsView(updated);
        this.logs.settingsChanged(view.baseCurrency, view.toleranceBps);
        return view;
    }
}
