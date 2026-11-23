import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';

const SCHEDULE: string = 'fixed-income-schedule';

export type ScheduleEndpoint = 'maturities' | 'real_rates';

@Injectable()
export class ScheduleLogService {
    public constructor(private readonly logService: LogService) {}

    public referenceMissing(endpoint: ScheduleEndpoint, cdiMissing: boolean, ipcaMissing: boolean): void {
        this.logService.warn({
            message: 'reference rates missing, rows are estimated',
            identifier: SCHEDULE,
            meta: { endpoint, cdiMissing, ipcaMissing }
        });
    }
}
