import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
import { IndexSeriesPointsRepository } from '../repositories/index-series-points.repository';
import { buildCdiCurve } from './curve/business-days';
import { SeriesPoint, CurveSeries } from './curve/curve.types';
import { buildIpcaSeries } from './curve/ipca-factor';
import { INDEX_SERIES, IndexSeriesName } from './index-series';
import { IndexSeriesPointRow } from './fixed-income.types';

function toPoint(row: IndexSeriesPointRow): SeriesPoint {
    return { date: DateUtil.onlyLocalDateString(row.date), value: row.value };
}

@Injectable()
export class IndexSeriesDomain {
    public constructor(private readonly points: IndexSeriesPointsRepository) {}

    public async loadPoints(series: IndexSeriesName): Promise<SeriesPoint[]> {
        return (await this.points.listSeries(series)).map(toPoint);
    }

    public async loadCurveSeries(): Promise<CurveSeries> {
        const [cdi, ipca]: [SeriesPoint[], SeriesPoint[]] = await Promise.all([
            this.loadPoints(INDEX_SERIES.cdiDaily),
            this.loadPoints(INDEX_SERIES.ipcaMonthly)
        ]);
        return { cdi: buildCdiCurve(cdi), ipca: buildIpcaSeries(ipca) };
    }

    public async lastPointDate(series: IndexSeriesName): Promise<string | null> {
        const row: IndexSeriesPointRow | null = await this.points.findLast(series);
        return row === null ? null : DateUtil.onlyLocalDateString(row.date);
    }

    public async savePoints(series: IndexSeriesName, source: string, points: readonly SeriesPoint[]): Promise<number> {
        await this.points.upsertMany(series, source, points);
        return points.length;
    }
}
