import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';

const DETECT: string = 'recurring-detect';
const WRITE: string = 'recurring-write';
const CATEGORY: string = 'recurring-category';
const REFRESH: string = 'recurring-refresh';

export interface DetectionCounts {
    readonly detected: number;
    readonly created: number;
    readonly refreshed: number;
    readonly removed: number;
    readonly stopped: number;
}

@Injectable()
export class RecurringLogService {
    public constructor(private readonly logService: LogService) {}

    public detected(counts: DetectionCounts, durationMs: number): void {
        this.logService.info({ message: 'recurring detection finished', identifier: DETECT, meta: { ...counts, durationMs } });
    }

    public written(action: string, seriesId: string): void {
        this.logService.info({ message: 'recurring series changed', identifier: WRITE, meta: { action, seriesId } });
    }

    public categoryRule(seriesId: string, outcome: string, recategorized: number): void {
        this.logService.info({
            message: 'recurring category rule applied',
            identifier: CATEGORY,
            meta: { seriesId, outcome, recategorized }
        });
    }

    public dailyFanout(companies: number): void {
        this.logService.info({ message: 'recurring daily fan-out queued', identifier: REFRESH, meta: { companies } });
    }

    public publishFailed(trigger: string): void {
        this.logService.warn({ message: 'recurring detection could not be queued', identifier: REFRESH, meta: { trigger } });
    }
}
