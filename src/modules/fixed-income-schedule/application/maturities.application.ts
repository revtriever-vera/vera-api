import { Injectable } from '@nestjs/common';
import { buildMaturities } from '../domain/maturity-schedule';
import { ReferenceRates, referenceRatesOf } from '../../fixed-income/services/index-series-math';
import { REQUEST_RESULTS, ScheduleInputs } from '../domain/schedule.types';
import { ScheduleLogService } from '../services/schedule-log.service';
import { ScheduleMetricsService } from '../services/schedule-metrics.service';
import { ScheduleSourceService } from '../services/schedule-source.service';
import { MaturitiesResponse } from '../validation/schedule.schemas';

@Injectable()
export class MaturitiesApplication {
    public constructor(
        private readonly source: ScheduleSourceService,
        private readonly logs: ScheduleLogService,
        private readonly metrics: ScheduleMetricsService
    ) {}

    public async list(limit: number): Promise<MaturitiesResponse> {
        const inputs: ScheduleInputs = await this.source.load(new Date());
        const rates: ReferenceRates = referenceRatesOf(inputs.series);
        this.report(rates);
        return {
            asOf: inputs.today,
            reference: {
                cdiAnnualBps: rates.cdiAnnualBps,
                ipca12mBps: rates.ipca12mBps,
                cdiDate: rates.cdiDate,
                ipcaMonth: rates.ipcaMonth
            },
            items: buildMaturities(inputs, rates, limit)
        };
    }

    private report(rates: ReferenceRates): void {
        const cdiMissing: boolean = rates.cdiAnnual === null;
        const ipcaMissing: boolean = rates.ipca12m === null;
        if (cdiMissing || ipcaMissing) {
            this.logs.referenceMissing('maturities', cdiMissing, ipcaMissing);
        }
        this.metrics.maturities(cdiMissing || ipcaMissing ? REQUEST_RESULTS.indexDataMissing : REQUEST_RESULTS.ok);
    }
}
