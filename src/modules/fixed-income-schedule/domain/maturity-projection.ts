import { Decimal, DecimalUtil, mulDecimal, toMinor } from '../../../shared/utils/decimal.util';
import { compoundFactor, Indexer, ReferenceRates } from '../../fixed-income/services/index-series-math';
import { nominalAnnualRate } from './reference-rates';
import {
    PROJECTION_BASES,
    Projection,
    ProjectionBasis,
    ScheduleTitle,
    ScheduleTreasury,
    TREASURY_FACE_VALUE,
    TREASURY_KINDS
} from './schedule.types';

const BRL: string = 'BRL';
const USD: string = 'USD';

const BASIS_BY_INDEXER: Readonly<Record<Indexer, ProjectionBasis>> = {
    prefixed: PROJECTION_BASES.contract,
    cdi_percent: PROJECTION_BASES.cdiProjection,
    ipca_plus: PROJECTION_BASES.ipcaProjection
};

function grown(valueMinor: number, annual: Decimal, today: string, maturityDate: string): number {
    return DecimalUtil.roundHalfUpToInteger(DecimalUtil.of(valueMinor).times(compoundFactor(annual, today, maturityDate)));
}

export function projectTitle(title: ScheduleTitle, today: string, rates: ReferenceRates): Projection {
    const basis: ProjectionBasis = BASIS_BY_INDEXER[title.indexer];
    const annual: Decimal | null = nominalAnnualRate(title.indexer, title.rateBps, rates);
    if (annual === null || title.indexDataMissing) {
        return { valueMinor: title.valueMinor, estimated: true, basis };
    }
    return {
        valueMinor: grown(title.valueMinor, annual, today, title.maturityDate),
        estimated: title.valuationEstimated || title.currency === USD,
        basis
    };
}

function projectBySeries(treasury: ScheduleTreasury, today: string, annual: Decimal | null, basis: ProjectionBasis): Projection | null {
    if (treasury.valueTodayMinor === null) {
        return null;
    }
    const estimated: boolean = basis === PROJECTION_BASES.inflationOnly;
    if (annual === null) {
        return { valueMinor: treasury.valueTodayMinor, estimated: true, basis };
    }
    return { valueMinor: grown(treasury.valueTodayMinor, annual, today, treasury.maturityDate), estimated, basis };
}

export function projectTreasury(treasury: ScheduleTreasury, today: string, rates: ReferenceRates): Projection | null {
    if (treasury.kind === TREASURY_KINDS.prefixed) {
        return {
            valueMinor: toMinor(mulDecimal(treasury.quantity, TREASURY_FACE_VALUE), BRL),
            estimated: false,
            basis: PROJECTION_BASES.faceValue
        };
    }
    if (treasury.kind === TREASURY_KINDS.selic) {
        return projectBySeries(treasury, today, rates.cdiAnnual, PROJECTION_BASES.cdiProjection);
    }
    return projectBySeries(treasury, today, rates.ipca12m, PROJECTION_BASES.inflationOnly);
}
