import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';

const LOG_IDENTIFIER: string = 'portfolio-watch';

@Injectable()
export class PortfolioWatchLogService {
    public constructor(private readonly logService: LogService) {}

    public snapshotFanOut(companies: number): void {
        this.logService.info({ message: 'portfolio monthly snapshot fan-out queued', identifier: LOG_IDENTIFIER, meta: { companies } });
    }

    public snapshotSaved(month: string, assets: number): void {
        this.logService.info({ message: 'portfolio monthly snapshot saved', identifier: LOG_IDENTIFIER, meta: { month, assets } });
    }

    public incomeRecorded(recorded: boolean): void {
        this.logService.info({ message: 'portfolio income ledger entry', identifier: LOG_IDENTIFIER, meta: { recorded } });
    }

    public dailyFanOut(companies: number): void {
        this.logService.info({ message: 'portfolio daily notices fan-out queued', identifier: LOG_IDENTIFIER, meta: { companies } });
    }

    public dailyEvaluated(entries: number, emails: number): void {
        this.logService.info({ message: 'portfolio daily notices evaluated', identifier: LOG_IDENTIFIER, meta: { entries, emails } });
    }
}
