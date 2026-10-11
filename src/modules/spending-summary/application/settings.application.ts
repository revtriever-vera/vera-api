import { Injectable } from '@nestjs/common';
import { SettingsChange, SpendingSettingsDomain, toSettingsView } from '../domain/spending-settings.domain';
import { SpendingSettingsView } from '../domain/spending-summary.types';
import { SpendingSettingsReaderService } from '../services/spending-settings-reader.service';
import { SpendingSummaryLogService } from '../services/spending-summary-log.service';

@Injectable()
export class SettingsApplication {
    public constructor(
        private readonly settings: SpendingSettingsDomain,
        private readonly reader: SpendingSettingsReaderService,
        private readonly logs: SpendingSummaryLogService
    ) {}

    public async get(): Promise<SpendingSettingsView> {
        return this.reader.get();
    }

    public async update(change: SettingsChange): Promise<SpendingSettingsView> {
        const view: SpendingSettingsView = toSettingsView(await this.settings.update(change));
        this.logs.settingsUpdated(view.incomeMode);
        return view;
    }
}
