import { SeriesPoint } from '../domain/curve/curve.types';
import { IndexSeriesName } from '../domain/index-series';

export abstract class IndexSeriesSourcePort {
    public abstract readonly source: string;
    public abstract fetch(series: IndexSeriesName, from: string, to: string): Promise<SeriesPoint[]>;
}
