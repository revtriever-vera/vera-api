import { Injectable } from '@nestjs/common';
import { CurveSeries } from '../domain/curve/curve.types';
import { IndexSeriesDomain } from '../domain/index-series.domain';

export type { CurveSeries };

@Injectable()
export class IndexSeriesReaderService {
    public constructor(private readonly series: IndexSeriesDomain) {}

    public async loadCurveSeries(): Promise<CurveSeries> {
        return this.series.loadCurveSeries();
    }
}
