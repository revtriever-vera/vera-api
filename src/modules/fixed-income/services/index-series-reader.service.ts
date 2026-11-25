import { Injectable } from '@nestjs/common';
import { CurveSeries, SeriesPoint } from '../domain/curve/curve.types';
import { IndexSeriesDomain } from '../domain/index-series.domain';
import { INDEX_SERIES } from '../domain/index-series';

export type { CurveSeries, SeriesPoint };

@Injectable()
export class IndexSeriesReaderService {
    public constructor(private readonly series: IndexSeriesDomain) {}

    public async loadCurveSeries(): Promise<CurveSeries> {
        return this.series.loadCurveSeries();
    }

    public async loadCdiSince(from: string): Promise<SeriesPoint[]> {
        return this.series.loadPointsSince(INDEX_SERIES.cdiDaily, from);
    }

    public async loadIpcaSince(from: string): Promise<SeriesPoint[]> {
        return this.series.loadPointsSince(INDEX_SERIES.ipcaMonthly, from);
    }

    public async loadSelicTargetSince(from: string): Promise<SeriesPoint[]> {
        return this.series.loadPointsSince(INDEX_SERIES.selicTargetDaily, from);
    }
}
