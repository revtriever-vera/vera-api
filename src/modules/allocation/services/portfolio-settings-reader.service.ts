import { Injectable } from '@nestjs/common';
import { toPortfolioSettingsView } from '../domain/asset-class.mapper';
import { PortfolioSettingsView } from '../domain/allocation.types';
import { PortfolioSettingsDomain } from '../domain/portfolio-settings.domain';

export type { PortfolioSettingsView };

@Injectable()
export class PortfolioSettingsReaderService {
    public constructor(private readonly settings: PortfolioSettingsDomain) {}

    public async get(): Promise<PortfolioSettingsView> {
        return toPortfolioSettingsView(await this.settings.ensure());
    }
}
