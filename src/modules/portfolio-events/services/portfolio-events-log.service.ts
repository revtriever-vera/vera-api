import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';

const SWEEP: string = 'portfolio-events-sweep';
const BATCH: string = 'portfolio-events-batch';
const LINKS: string = 'portfolio-events-links';

@Injectable()
export class PortfolioEventsLogService {
    public constructor(private readonly logService: LogService) {}

    public sweepFinished(held: number, unlinked: number, batches: number): void {
        this.logService.info({ message: 'sweep finished', identifier: SWEEP, meta: { held, unlinked, batches } });
    }

    public batchFinished(source: string, assets: number, events: number, failed: number): void {
        this.logService.info({ message: 'batch finished', identifier: BATCH, meta: { source, assets, events, failed } });
    }

    public sourceFailed(source: string, reason: string): void {
        this.logService.warn({ message: 'source failed', identifier: BATCH, meta: { source, reason } });
    }

    public invalidPayload(): void {
        this.logService.error({ message: 'invalid payload', identifier: BATCH, meta: {} });
    }

    public sourceUnavailable(source: string): void {
        this.logService.warn({ message: 'source unavailable', identifier: BATCH, meta: { source } });
    }

    public linksRefreshed(issuers: number, matched: number, saved: number): void {
        this.logService.info({ message: 'links refreshed', identifier: LINKS, meta: { issuers, matched, saved } });
    }
}
