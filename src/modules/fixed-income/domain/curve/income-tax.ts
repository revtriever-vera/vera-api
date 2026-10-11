import { DecimalUtil } from '../../../../shared/utils/decimal.util';
import { TAX_REGIMES, TaxRegime } from './curve.types';

interface TaxBracket {
    readonly upToDays: number;
    readonly rate: string;
}

const REGRESSIVE_BRACKETS: readonly TaxBracket[] = [
    { upToDays: 180, rate: '0.225' },
    { upToDays: 360, rate: '0.20' },
    { upToDays: 720, rate: '0.175' }
];
const TOP_RATE: string = '0.15';

export function regressiveRate(daysHeld: number): string {
    return REGRESSIVE_BRACKETS.find((bracket: TaxBracket) => daysHeld <= bracket.upToDays)?.rate ?? TOP_RATE;
}

export function estimateIncomeTax(regime: TaxRegime, appliedMinor: number, valueMinor: number, daysHeld: number): number {
    if (regime === TAX_REGIMES.exempt || valueMinor <= appliedMinor) {
        return 0;
    }
    return DecimalUtil.roundHalfUpToInteger(DecimalUtil.of(valueMinor - appliedMinor).times(regressiveRate(daysHeld)));
}
