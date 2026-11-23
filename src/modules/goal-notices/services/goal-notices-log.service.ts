import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';

const LOG_IDENTIFIER: string = 'goal-notices';

@Injectable()
export class GoalNoticesLogService {
    public constructor(private readonly logService: LogService) {}

    public fanOut(companies: number): void {
        this.logService.info({ message: 'goal notices fan-out queued', identifier: LOG_IDENTIFIER, meta: { companies } });
    }

    public evaluated(behind: number, notified: number): void {
        this.logService.info({ message: 'goal notices evaluated', identifier: LOG_IDENTIFIER, meta: { behind, notified } });
    }
}
