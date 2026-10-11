import { Injectable } from '@nestjs/common';
import { SpendingSettingsDomain, toSettingsView } from '../domain/spending-settings.domain';
import { SpendingSettingsView } from '../domain/spending-summary.types';

export type SpendingSettings = SpendingSettingsView;

@Injectable()
export class SpendingSettingsReaderService {
    public constructor(private readonly settings: SpendingSettingsDomain) {}

    public async get(): Promise<SpendingSettingsView> {
        return toSettingsView(await this.settings.ensure());
    }
}
