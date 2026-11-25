import { Injectable } from '@nestjs/common';
import { ReferenceRates, referenceRatesOf } from '../../fixed-income/services/index-series-math';
import { buildMaturities } from '../domain/maturity-schedule';
import { MATURITIES_MAX_LIMIT, MaturityItem, ScheduleInputs } from '../domain/schedule.types';
import { ScheduleSourceService } from './schedule-source.service';

export type { MaturityItem };

export interface MaturitiesReading {
    readonly asOf: string;
    readonly rates: ReferenceRates;
    readonly items: readonly MaturityItem[];
}

@Injectable()
export class MaturitiesReaderService {
    public constructor(private readonly source: ScheduleSourceService) {}

    public async readAll(): Promise<MaturitiesReading> {
        return this.read(MATURITIES_MAX_LIMIT);
    }

    public async read(limit: number): Promise<MaturitiesReading> {
        const inputs: ScheduleInputs = await this.source.load(new Date());
        const rates: ReferenceRates = referenceRatesOf(inputs.series);
        return { asOf: inputs.today, rates, items: buildMaturities(inputs, rates, limit) };
    }
}
