import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';

const LOG_IDENTIFIER: string = 'recurring-notices';

@Injectable()
export class RecurringNoticesLogService {
    public constructor(private readonly logService: LogService) {}

    public dailyFanout(companies: number): void {
        this.logService.info({ message: 'recurring notices daily fan-out queued', identifier: LOG_IDENTIFIER, meta: { companies } });
    }

    public scheduled(weekQueued: boolean, dueQueued: number): void {
        this.logService.info({ message: 'recurring notices scheduled', identifier: LOG_IDENTIFIER, meta: { weekQueued, dueQueued } });
    }

    public skipped(type: string, reason: string): void {
        this.logService.info({ message: 'recurring notice skipped', identifier: LOG_IDENTIFIER, meta: { type, reason } });
    }

    public delivered(type: string, sent: number, skipped: number): void {
        this.logService.info({ message: 'recurring notice delivered', identifier: LOG_IDENTIFIER, meta: { type, sent, skipped } });
    }
}
