import { Injectable } from '@nestjs/common';
import { buildRealRates } from '../domain/real-rate';
import { ReferenceRates, referenceRatesOf } from '../../fixed-income/services/index-series-math';
import { REQUEST_RESULTS } from '../domain/schedule.types';
import { ScheduleIndexDataMissingError } from '../domain/schedule.errors';
import { ScheduleLogService } from '../services/schedule-log.service';
import { ScheduleMetricsService } from '../services/schedule-metrics.service';
import { ScheduleSourceService, TitlesInputs } from '../services/schedule-source.service';
import { RealRatesResponse } from '../validation/schedule.schemas';

@Injectable()
export class RealRatesApplication {
    public constructor(
        private readonly source: ScheduleSourceService,
        private readonly logs: ScheduleLogService,
        private readonly metrics: ScheduleMetricsService
    ) {}

    public async list(): Promise<RealRatesResponse> {
        const inputs: TitlesInputs = await this.source.loadTitles(new Date());
        const rates: ReferenceRates = referenceRatesOf(inputs.series);
        if (rates.ipca12mBps === null || rates.ipcaMonth === null) {
            this.logs.referenceMissing('real_rates', rates.cdiAnnual === null, true);
            this.metrics.realRates(REQUEST_RESULTS.indexDataMissing);
            throw new ScheduleIndexDataMissingError();
        }
        this.metrics.realRates(REQUEST_RESULTS.ok);
        return {
            asOf: inputs.today,
            reference: { ipca12mBps: rates.ipca12mBps, ipcaMonth: rates.ipcaMonth },
            items: buildRealRates({ ...inputs, usdRate: null, treasuries: [] }, rates)
        };
    }
}
