import { Decimal, DecimalUtil } from '../../../shared/utils/decimal.util';
import { Indexer, ReferenceRates } from '../../fixed-income/services/index-series-math';

const BPS_PER_UNIT: number = 10000;

export function nominalAnnualRate(indexer: Indexer, rateBps: number, rates: ReferenceRates): Decimal | null {
    const contracted: Decimal = DecimalUtil.of(rateBps).div(BPS_PER_UNIT);
    if (indexer === 'prefixed') {
        return contracted;
    }
    if (indexer === 'cdi_percent') {
        return rates.cdiAnnual === null ? null : contracted.times(rates.cdiAnnual);
    }
    return rates.ipca12m === null ? null : DecimalUtil.of(1).plus(rates.ipca12m).times(DecimalUtil.of(1).plus(contracted)).minus(1);
}
