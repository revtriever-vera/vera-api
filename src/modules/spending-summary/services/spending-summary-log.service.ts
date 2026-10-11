import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';
import { IncomeMode } from '../domain/spending-summary.types';

const SUMMARY: string = 'spending-summary';
const SETTINGS: string = 'spending-settings';

@Injectable()
export class SpendingSummaryLogService {
    public constructor(private readonly logService: LogService) {}

    public summaryBuilt(month: string, isPartial: boolean, categories: number, durationMs: number): void {
        this.logService.debug({
            message: 'spending summary built',
            identifier: SUMMARY,
            meta: { month, isPartial, categories, durationMs }
        });
    }

    public settingsUpdated(incomeMode: IncomeMode): void {
        this.logService.info({ message: 'spending settings updated', identifier: SETTINGS, meta: { action: 'updated', incomeMode } });
    }
}
