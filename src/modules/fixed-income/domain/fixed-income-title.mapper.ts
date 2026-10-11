import { DateUtil } from '../../../shared/utils/date.util';
import { Currency, FixedIncomeValuation, Indexer, TaxRegime } from './curve/curve.types';
import { FixedIncomeTitle, FixedIncomeTitleRow, FixedIncomeTitleView, TitleKind } from './fixed-income.types';

export function toFixedIncomeTitle(row: FixedIncomeTitleRow): FixedIncomeTitle {
    return {
        id: row.id,
        kind: row.kind as TitleKind,
        name: row.name,
        indexer: row.indexer as Indexer,
        rateBps: row.rateBps,
        currency: row.currency as Currency,
        appliedMinor: Number(row.appliedMinor),
        appliedAt: DateUtil.onlyLocalDateString(row.appliedAt),
        maturityDate: DateUtil.onlyLocalDateString(row.maturityDate),
        taxRegime: row.taxRegime as TaxRegime,
        isSample: row.isSample,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
    };
}

export function toFixedIncomeTitleView(title: FixedIncomeTitle, classId: string, valuation: FixedIncomeValuation): FixedIncomeTitleView {
    return {
        id: title.id,
        kind: title.kind,
        name: title.name,
        indexer: title.indexer,
        rateBps: title.rateBps,
        currency: title.currency,
        appliedMinor: title.appliedMinor,
        appliedAt: title.appliedAt,
        maturityDate: title.maturityDate,
        classId,
        createdAt: title.createdAt.toISOString(),
        updatedAt: title.updatedAt.toISOString(),
        valuation
    };
}
