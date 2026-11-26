import { Injectable } from '@nestjs/common';
import { REQUEST_RESULTS } from '../domain/schedule.types';
import { MaturitiesReaderService, MaturitiesReading } from '../services/maturities-reader.service';
import { ScheduleLogService } from '../services/schedule-log.service';
import { ScheduleMetricsService } from '../services/schedule-metrics.service';
import { MaturitiesResponse } from '../validation/schedule.schemas';

@Injectable()
export class MaturitiesApplication {
    public constructor(
        private readonly reader: MaturitiesReaderService,
        private readonly logs: ScheduleLogService,
        private readonly metrics: ScheduleMetricsService
    ) {}

    public async list(limit: number): Promise<MaturitiesResponse> {
        const reading: MaturitiesReading = await this.reader.read(limit);
        this.report(reading);
        return {
            asOf: reading.asOf,
            reference: {
                cdiAnnualBps: reading.rates.cdiAnnualBps,
                ipca12mBps: reading.rates.ipca12mBps,
                cdiDate: reading.rates.cdiDate,
                ipcaMonth: reading.rates.ipcaMonth
            },
            items: [...reading.items]
        };
    }

    private report(reading: MaturitiesReading): void {
        const cdiMissing: boolean = reading.rates.cdiAnnual === null;
        const ipcaMissing: boolean = reading.rates.ipca12m === null;
        if (cdiMissing || ipcaMissing) {
            this.logs.referenceMissing('maturities', cdiMissing, ipcaMissing);
        }
        this.metrics.maturities(cdiMissing || ipcaMissing ? REQUEST_RESULTS.indexDataMissing : REQUEST_RESULTS.ok);
    }
}
