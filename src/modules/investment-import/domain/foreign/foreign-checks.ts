import { DecimalUtil } from '../../../../shared/utils/decimal.util';
import { LINE_REASONS, StoredLine } from '../investment-import.types';

const TRADED_KINDS: ReadonlySet<string> = new Set(['buy', 'sell']);

export interface ForeignCheckInput {
    readonly afterQuantity: string;
    readonly latestTradeDate: string | null;
}

export function foreignCheckOf(line: StoredLine, input: ForeignCheckInput): string | null {
    if (line.dollar === undefined || !TRADED_KINDS.has(line.kind)) {
        return null;
    }
    if (input.latestTradeDate !== null && line.tradeDate < input.latestTradeDate) {
        return LINE_REASONS.outOfOrder;
    }
    const closing: string | null = line.dollar.closingQuantity;
    return closing !== null && !DecimalUtil.of(closing).eq(DecimalUtil.of(input.afterQuantity)) ? LINE_REASONS.positionMismatch : null;
}
