import { Decimal, DecimalUtil } from '../../../../shared/utils/decimal.util';

export const BUSINESS_DAYS_PER_YEAR: number = 252;
const BPS_PER_UNIT: number = 10000;

export function annualRateFactor(rateBps: number, businessDays: number): Decimal {
    return DecimalUtil.of(1).plus(DecimalUtil.of(rateBps).div(BPS_PER_UNIT)).pow(DecimalUtil.of(businessDays).div(BUSINESS_DAYS_PER_YEAR));
}
