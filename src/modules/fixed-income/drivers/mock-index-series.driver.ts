import { Injectable } from '@nestjs/common';
import { addDays, isWeekday } from '../domain/curve/business-days';
import { SeriesPoint } from '../domain/curve/curve.types';
import { INDEX_SERIES, IndexSeriesName } from '../domain/index-series';
import { nextMonthStart } from '../domain/curve/ipca-factor';
import { IndexSeriesSourcePort } from '../ports/index-series-source.port';

export const MOCK_DAILY_CDI: string = '0.04016754';
export const MOCK_MONTHLY_IPCA: string = '0.40000000';
export const MOCK_SELIC_TARGET: string = '13.75000000';

@Injectable()
export class MockIndexSeriesDriver extends IndexSeriesSourcePort {
    public readonly source: string = 'mock';

    public fetch(series: IndexSeriesName, from: string, to: string): Promise<SeriesPoint[]> {
        if (series === INDEX_SERIES.ipcaMonthly) {
            return Promise.resolve(this.monthlyIpca(from, to));
        }
        return Promise.resolve(this.daily(series, from, to));
    }

    private daily(series: IndexSeriesName, from: string, to: string): SeriesPoint[] {
        const value: string = series === INDEX_SERIES.cdiDaily ? MOCK_DAILY_CDI : MOCK_SELIC_TARGET;
        const points: SeriesPoint[] = [];
        for (let date: string = from; date <= to; date = addDays(date, 1)) {
            if (isWeekday(date)) {
                points.push({ date, value });
            }
        }
        return points;
    }

    private monthlyIpca(from: string, to: string): SeriesPoint[] {
        const points: SeriesPoint[] = [];
        for (let date: string = `${from.slice(0, 7)}-01`; date <= to; date = nextMonthStart(date)) {
            points.push({ date, value: MOCK_MONTHLY_IPCA });
        }
        return points;
    }
}
