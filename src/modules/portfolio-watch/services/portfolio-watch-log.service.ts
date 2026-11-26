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

    public snapshotSkippedMissingQuotes(month: string, missingQuotes: number): void {
        this.logService.warn({
            message: 'portfolio monthly snapshot skipped: holdings without quote',
            identifier: LOG_IDENTIFIER,
            meta: { month, missingQuotes }
        });
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

    public weeklyFanOut(companies: number): void {
        this.logService.info({ message: 'portfolio weekly changes fan-out queued', identifier: LOG_IDENTIFIER, meta: { companies } });
    }

    public weeklyEvaluated(items: number, emails: number): void {
        this.logService.info({ message: 'portfolio weekly changes evaluated', identifier: LOG_IDENTIFIER, meta: { items, emails } });
    }

    public reviewFanOut(companies: number): void {
        this.logService.info({ message: 'portfolio monthly review fan-out queued', identifier: LOG_IDENTIFIER, meta: { companies } });
    }

    public reviewSaved(month: string, recorded: boolean): void {
        this.logService.info({ message: 'portfolio monthly review saved', identifier: LOG_IDENTIFIER, meta: { month, recorded } });
    }

    public reviewAnnounced(withParagraph: boolean, emails: number): void {
        this.logService.info({
            message: 'portfolio monthly review announced',
            identifier: LOG_IDENTIFIER,
            meta: { withParagraph, emails }
        });
    }

    public reviewSkippedNoSnapshot(month: string): void {
        this.logService.warn({
            message: 'portfolio monthly review skipped: no complete snapshot at the end of the month',
            identifier: LOG_IDENTIFIER,
            meta: { month }
        });
    }
}
