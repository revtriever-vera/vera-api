import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';
import { QuoteGroup } from '../domain/market-data.types';

const SWEEP: string = 'market-data-sweep';
const CHUNK: string = 'market-data-chunk';
const PROVIDER: string = 'market-data-provider';
const FX: string = 'market-data-fx';
const BUDGET: string = 'market-data-budget';

@Injectable()
export class MarketDataLogService {
    public constructor(private readonly logService: LogService) {}

    public sweepFinished(held: number, chunks: number): void {
        this.logService.info({ message: 'sweep finished', identifier: SWEEP, meta: { held, chunks } });
    }

    public groupWithoutProvider(group: QuoteGroup): void {
        this.logService.warn({ message: 'group without provider', identifier: SWEEP, meta: { group } });
    }

    public chunkFinished(provider: string, requested: number, stored: number, failed: number): void {
        this.logService.info({ message: 'chunk finished', identifier: CHUNK, meta: { provider, requested, stored, failed } });
    }

    public providerFailed(provider: string, stage: string, reason: string): void {
        this.logService.warn({ message: 'provider failed', identifier: PROVIDER, meta: { provider, stage, reason } });
    }

    public rateStored(currency: string, date: string, source: string): void {
        this.logService.info({ message: 'exchange rate stored', identifier: FX, meta: { currency, date, source } });
    }

    public rateMissing(currency: string): void {
        this.logService.warn({ message: 'exchange rate missing', identifier: FX, meta: { currency } });
    }

    public rateFailed(currency: string, error: unknown): void {
        this.logService.error({ message: 'exchange rate failed', identifier: FX, meta: { currency }, error });
    }

    public budgetRefused(provider: string, calls: number): void {
        this.logService.warn({ message: 'budget refused', identifier: BUDGET, meta: { provider, calls } });
    }

    public invalidPayload(type: string): void {
        this.logService.error({ message: 'invalid payload', identifier: SWEEP, meta: { type } });
    }
}
