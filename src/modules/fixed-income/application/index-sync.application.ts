import { Injectable } from '@nestjs/common';
import { MESSAGE_TYPES, QUEUES } from '../../../shared/constants/queues.constants';
import { QueuePublisherPort } from '../../../core/queue/queue.types';
import { DateUtil } from '../../../shared/utils/date.util';
import { SeriesPoint } from '../domain/curve/curve.types';
import { daysBetween } from '../domain/curve/business-days';
import { IndexSeriesDomain } from '../domain/index-series.domain';
import { INDEX_SERIES_NAMES, IndexSeriesName } from '../domain/index-series';
import { planSyncWindows, SyncWindow } from '../domain/index-sync-windows';
import { IndexSeriesSourcePort } from '../ports/index-series-source.port';
import { FixedIncomeLogService } from '../services/fixed-income-log.service';
import { FixedIncomeMetricsService } from '../services/fixed-income-metrics.service';

export interface SeriesSyncPayload {
    readonly series: IndexSeriesName;
    readonly from: string;
    readonly to: string;
}

export function syncJobId(payload: SeriesSyncPayload): string {
    return `fixed-income-index-sync-${payload.series.replace('_', '-')}-${payload.from}-${payload.to}`;
}

@Injectable()
export class IndexSyncApplication {
    public constructor(
        private readonly indexSeries: IndexSeriesDomain,
        private readonly source: IndexSeriesSourcePort,
        private readonly publisher: QueuePublisherPort,
        private readonly logs: FixedIncomeLogService,
        private readonly metrics: FixedIncomeMetricsService
    ) {}

    public async requestSync(now: Date = new Date()): Promise<void> {
        const today: string = DateUtil.localDateIn(DateUtil.BRAZIL_TIMEZONE, now);
        for (const series of INDEX_SERIES_NAMES) {
            await this.requestSeries(series, today);
        }
    }

    public async syncWindow(payload: SeriesSyncPayload): Promise<number> {
        try {
            const points: SeriesPoint[] = await this.source.fetch(payload.series, payload.from, payload.to);
            const saved: number = await this.indexSeries.savePoints(payload.series, this.source.source, points);
            this.metrics.sync(payload.series, 'success');
            this.logs.seriesSynced(payload.series, payload.from, payload.to, saved);
            return saved;
        } catch (error: unknown) {
            this.metrics.sync(payload.series, 'failure');
            this.logs.seriesSyncFailed(payload.series, payload.from, payload.to, error);
            throw error;
        }
    }

    private async requestSeries(series: IndexSeriesName, today: string): Promise<void> {
        const last: string | null = await this.indexSeries.lastPointDate(series);
        if (last !== null) {
            this.metrics.indexAge(series, Math.max(daysBetween(last, today), 0));
        }
        const windows: SyncWindow[] = planSyncWindows(last, today);
        for (const window of windows) {
            const payload: SeriesSyncPayload = { series, from: window.from, to: window.to };
            await this.publisher.publish(QUEUES.fixedIncome, MESSAGE_TYPES.fixedIncomeIndexSyncSeriesRequested, payload, {
                jobId: syncJobId(payload)
            });
        }
        this.logs.syncRequested(series, windows.length);
    }
}
