import { DecimalUtil } from '../../shared/utils/decimal.util';
import { MICROS_PER_UNIT } from './usage.types';

export function usdToMicros(amountUsd: string, usdBrlRate: string): number {
    return DecimalUtil.roundHalfUpToInteger(DecimalUtil.of(amountUsd).mul(usdBrlRate).mul(MICROS_PER_UNIT));
}

export function brlToMicros(amountBrl: string): number {
    return DecimalUtil.roundHalfUpToInteger(DecimalUtil.of(amountBrl).mul(MICROS_PER_UNIT));
}

export function scaleMicros(micros: number, multiplier: number): number {
    return DecimalUtil.roundHalfUpToInteger(DecimalUtil.of(micros).mul(multiplier));
}
