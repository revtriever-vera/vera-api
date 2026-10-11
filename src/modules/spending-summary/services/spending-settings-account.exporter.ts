import { Injectable } from '@nestjs/common';
import { AccountDataExporterPort } from '../../identity/services/account-data-exporter.port';
import { SpendingSettingsDomain, toSettingsView } from '../domain/spending-settings.domain';
import { SpendingSettingsRow, SpendingSettingsView } from '../domain/spending-summary.types';

export const SPENDING_SETTINGS_EXPORT_AREA: string = 'spending_settings';

export type SpendingSettingsExport = SpendingSettingsView;

@Injectable()
export class SpendingSettingsAccountExporter extends AccountDataExporterPort {
    public readonly area: string = SPENDING_SETTINGS_EXPORT_AREA;

    public constructor(private readonly settings: SpendingSettingsDomain) {
        super();
    }

    public async exportAll(): Promise<SpendingSettingsExport | null> {
        const current: SpendingSettingsRow | null = await this.settings.current();
        if (current === null) {
            return null;
        }
        const view: SpendingSettingsView = toSettingsView(current);
        return { savingsGoalBps: view.savingsGoalBps, incomeMode: view.incomeMode, declaredIncomeMinor: view.declaredIncomeMinor };
    }
}
