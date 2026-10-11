import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
import { CurveSeries, FixedIncomeValuation, VALUATION_STATUSES } from '../domain/curve/curve.types';
import { valueTitle } from '../domain/curve/value-title';
import { FixedIncomeTitleDomain } from '../domain/fixed-income-title.domain';
import { TitleNotFoundError } from '../domain/fixed-income.errors';
import { FixedIncomeTitle, TAX_REGIME_BY_KIND, TitleTerms, ValuedTitle } from '../domain/fixed-income.types';
import { IndexSeriesDomain } from '../domain/index-series.domain';
import { FixedIncomeLogService } from './fixed-income-log.service';
import { FixedIncomeMetricsService } from './fixed-income-metrics.service';

export type { ValuedTitle };

@Injectable()
export class FixedIncomeValuationService {
    public constructor(
        private readonly titles: FixedIncomeTitleDomain,
        private readonly indexSeries: IndexSeriesDomain,
        private readonly logs: FixedIncomeLogService,
        private readonly metrics: FixedIncomeMetricsService
    ) {}

    public static referenceDate(asOf: Date): string {
        return DateUtil.localDateIn(DateUtil.BRAZIL_TIMEZONE, asOf);
    }

    public async valueAll(asOf: Date): Promise<ReadonlyArray<ValuedTitle>> {
        const titles: FixedIncomeTitle[] = await this.titles.listAll();
        return this.valueMany(titles, asOf);
    }

    public async valueOne(id: string, asOf: Date): Promise<ValuedTitle> {
        const title: FixedIncomeTitle | null = await this.titles.findById(id);
        if (title === null) {
            throw new TitleNotFoundError(id);
        }
        const [valued]: ValuedTitle[] = await this.valueMany([title], asOf);
        return valued as ValuedTitle;
    }

    public async valueTitleNow(title: FixedIncomeTitle, asOf: Date): Promise<FixedIncomeValuation> {
        const [valued]: ValuedTitle[] = await this.valueMany([title], asOf);
        return (valued as ValuedTitle).valuation;
    }

    public async preview(terms: TitleTerms, asOf: Date): Promise<FixedIncomeValuation> {
        const series: CurveSeries = await this.indexSeries.loadCurveSeries();
        return valueTitle({ ...terms, taxRegime: TAX_REGIME_BY_KIND[terms.kind] }, series, FixedIncomeValuationService.referenceDate(asOf));
    }

    private async valueMany(titles: readonly FixedIncomeTitle[], asOf: Date): Promise<ValuedTitle[]> {
        const series: CurveSeries = await this.indexSeries.loadCurveSeries();
        const reference: string = FixedIncomeValuationService.referenceDate(asOf);
        const valued: ValuedTitle[] = titles.map((title: FixedIncomeTitle): ValuedTitle => ({
            title,
            valuation: valueTitle(title, series, reference)
        }));
        this.report(
            valued.map((entry: ValuedTitle) => entry.valuation),
            series
        );
        return valued;
    }

    private report(valuations: readonly FixedIncomeValuation[], series: CurveSeries): void {
        const missing: number = valuations.filter(
            (valuation: FixedIncomeValuation) => valuation.status === VALUATION_STATUSES.indexDataMissing
        ).length;
        this.metrics.valuation(VALUATION_STATUSES.ok, valuations.length - missing);
        if (missing > 0) {
            this.metrics.valuation(VALUATION_STATUSES.indexDataMissing, missing);
            this.logs.valuationMissingData(missing, series.cdi.dates.at(-1) ?? null);
        }
    }
}
