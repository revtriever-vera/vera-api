import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { DateUtil } from '../../../shared/utils/date.util';
import { usageConfig } from '../config/usage.config';
import { UsageLogService } from '../services/usage-log.service';
import { UsdRate } from '../usage.types';
import { UsdRatePort } from './usd-rate.port';

@Injectable()
export class UsdRateHolder {
    private port: UsdRatePort | null = null;

    public constructor(
        @Inject(usageConfig.KEY) private readonly config: ConfigType<typeof usageConfig>,
        private readonly logs: UsageLogService
    ) {}

    public register(port: UsdRatePort): void {
        this.port = port;
    }

    public async current(): Promise<UsdRate> {
        const live: UsdRate | null = await this.live();
        return live ?? this.fallback();
    }

    private async live(): Promise<UsdRate | null> {
        if (this.port === null) {
            return null;
        }
        try {
            return await this.port.current();
        } catch (error: unknown) {
            this.logs.fallbackRate(error);
            return null;
        }
    }

    private fallback(): UsdRate {
        return { rate: this.config.USAGE_USD_BRL_FALLBACK, date: DateUtil.todayInBrazil(), source: 'fallback' };
    }
}
