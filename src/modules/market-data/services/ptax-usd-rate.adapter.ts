import { Injectable, OnModuleInit } from '@nestjs/common';
import { UsdRateHolder } from '../../../core/usage/ports/usd-rate.holder';
import { UsdRatePort } from '../../../core/usage/ports/usd-rate.port';
import { UsdRateUnavailableError } from '../../../core/usage/usage.errors';
import { UsdRate } from '../../../core/usage/usage.types';
import { DateUtil } from '../../../shared/utils/date.util';
import { ExchangeRateReaderService, StoredRate } from './exchange-rate-reader.service';

export const MAX_RATE_AGE_DAYS: number = 7;
const DAY_MS: number = 86_400_000;

@Injectable()
export class PtaxUsdRateAdapter extends UsdRatePort implements OnModuleInit {
    public constructor(
        private readonly rates: ExchangeRateReaderService,
        private readonly holder: UsdRateHolder
    ) {
        super();
    }

    public onModuleInit(): void {
        this.holder.register(this);
    }

    public async current(now: Date = new Date()): Promise<UsdRate> {
        const stored: StoredRate | null = await this.rates.latest('USD', now);
        if (stored === null || this.ageInDays(stored.date, now) > MAX_RATE_AGE_DAYS) {
            throw new UsdRateUnavailableError();
        }
        return { rate: stored.brlPerUnit, date: stored.date, source: 'ptax' };
    }

    private ageInDays(rateDate: string, now: Date): number {
        const today: string = DateUtil.localDateIn(DateUtil.BRAZIL_TIMEZONE, now);
        return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${rateDate}T00:00:00Z`)) / DAY_MS);
    }
}
