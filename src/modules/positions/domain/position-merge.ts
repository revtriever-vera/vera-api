import Decimal from 'decimal.js';
import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { Position, PositionPatch } from './positions.types';

const QUANTITY_SCALE: number = 10;
const PRICE_SCALE: number = 8;

function weightedPrice(kept: Position, folded: Position, total: Decimal): string | null {
    if (kept.averagePrice === null || folded.averagePrice === null) {
        return kept.averagePrice ?? folded.averagePrice;
    }
    if (total.isZero()) {
        return kept.averagePrice;
    }
    const paid: Decimal = DecimalUtil.of(kept.quantity)
        .mul(kept.averagePrice)
        .add(DecimalUtil.of(folded.quantity).mul(folded.averagePrice));
    return paid.div(total).toDecimalPlaces(PRICE_SCALE, Decimal.ROUND_HALF_UP).toFixed();
}

export function mergedPositionPatch(kept: Position, folded: Position): PositionPatch {
    const total: Decimal = DecimalUtil.of(kept.quantity).add(folded.quantity);
    return {
        quantity: total.toDecimalPlaces(QUANTITY_SCALE, Decimal.ROUND_HALF_UP).toFixed(),
        averagePrice: weightedPrice(kept, folded, total)
    };
}
