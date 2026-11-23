import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { BPS_BASE } from '../../spending-summary/domain/spending-summary.types';
import { RESERVE_CHANGE_THRESHOLD_BPS, ReserveBasis } from './goals.types';

export interface ReserveReview {
    readonly months: number;
    readonly baseMinor: number;
    readonly averageMinor: number | null;
    readonly suggestedMinor: number | null;
    readonly deltaBps: number | null;
    readonly shouldUpdate: boolean;
}

export function suggestedReserveMinor(averageMinor: number | null, months: number): number | null {
    return averageMinor === null ? null : averageMinor * months;
}

/** O alvo da reserva guarda a base usada (alvo ÷ meses, meio para cima), para avisar quando a média anda mais de 10%. */
export function reserveBaseOf(targetMinor: number, months: number): number {
    return Math.max(1, DecimalUtil.roundHalfUpToInteger(DecimalUtil.of(targetMinor).div(months)));
}

export function reviewReserve(basis: ReserveBasis, averageMinor: number | null): ReserveReview {
    const deltaBps: number | null =
        averageMinor === null
            ? null
            : DecimalUtil.roundHalfUpToInteger(
                  DecimalUtil.of(averageMinor - basis.baseMinor)
                      .mul(BPS_BASE)
                      .div(basis.baseMinor)
              );
    return {
        months: basis.months,
        baseMinor: basis.baseMinor,
        averageMinor,
        suggestedMinor: suggestedReserveMinor(averageMinor, basis.months),
        deltaBps,
        shouldUpdate: deltaBps !== null && Math.abs(deltaBps) > RESERVE_CHANGE_THRESHOLD_BPS
    };
}
