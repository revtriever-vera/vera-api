import { Injectable } from '@nestjs/common';
import { ReferenceRates, referenceRatesOf } from '../../fixed-income/services/index-series-math';
import { buildRealRates } from '../domain/real-rate';
import { RealRateItem } from '../domain/schedule.types';
import { ScheduleSourceService, TitlesInputs } from './schedule-source.service';

export type { RealRateItem };

export interface RealRatesReading {
    readonly asOf: string;
    readonly rates: ReferenceRates;
    readonly items: readonly RealRateItem[];
}

@Injectable()
export class RealRatesReaderService {
    public constructor(private readonly source: ScheduleSourceService) {}

    public async readAll(): Promise<RealRatesReading> {
        const inputs: TitlesInputs = await this.source.loadTitles(new Date());
        const rates: ReferenceRates = referenceRatesOf(inputs.series);
        return { asOf: inputs.today, rates, items: buildRealRates({ ...inputs, usdRate: null, treasuries: [] }, rates) };
    }
}
