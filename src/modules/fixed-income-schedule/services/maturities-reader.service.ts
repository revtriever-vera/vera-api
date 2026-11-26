import { Injectable } from '@nestjs/common';
import { ANY_HOLDER, HolderFilter } from '../../../shared/holder/holder-filter';
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

    public async readAll(filter: HolderFilter = ANY_HOLDER): Promise<MaturitiesReading> {
        return this.read(MATURITIES_MAX_LIMIT, filter);
    }

    public async read(limit: number, filter: HolderFilter = ANY_HOLDER): Promise<MaturitiesReading> {
        const inputs: ScheduleInputs = await this.source.load(new Date(), filter);
        const rates: ReferenceRates = referenceRatesOf(inputs.series);
        return { asOf: inputs.today, rates, items: buildMaturities(inputs, rates, limit) };
    }
}
