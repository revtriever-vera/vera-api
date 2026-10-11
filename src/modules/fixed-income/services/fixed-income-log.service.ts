import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';
import { TitleAction, TitleKind } from '../domain/fixed-income.types';
import { Indexer } from '../domain/curve/curve.types';

const TITLE: string = 'fixed-income-title';
const INDEX_SYNC: string = 'fixed-income-index-sync';
const VALUATION: string = 'fixed-income-valuation';

@Injectable()
export class FixedIncomeLogService {
    public constructor(private readonly logService: LogService) {}

    public titleChanged(action: TitleAction, titleId: string, kind: TitleKind, indexer: Indexer): void {
        this.logService.info({ message: 'fixed income title changed', identifier: TITLE, meta: { action, titleId, kind, indexer } });
    }

    public seriesSynced(series: string, from: string, to: string, points: number): void {
        this.logService.info({ message: 'index series synced', identifier: INDEX_SYNC, meta: { series, from, to, points } });
    }

    public seriesSyncFailed(series: string, from: string, to: string, error: unknown): void {
        this.logService.error({ message: 'index series sync failed', identifier: INDEX_SYNC, meta: { series, from, to }, error });
    }

    public syncRequested(series: string, windows: number): void {
        this.logService.info({ message: 'index series sync requested', identifier: INDEX_SYNC, meta: { series, windows } });
    }

    public valuationMissingData(titles: number, seriesLastDate: string | null): void {
        this.logService.warn({
            message: 'index data does not cover fixed income titles',
            identifier: VALUATION,
            meta: { status: 'index_data_missing', titles, seriesLastDate }
        });
    }
}
