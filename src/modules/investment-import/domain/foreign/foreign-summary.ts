import { DecimalUtil, mulDecimal, toMinor } from '../../../../shared/utils/decimal.util';
import { LINE_REASONS } from '../investment-import.types';
import {
    FOREIGN_BLOCKS,
    ForeignExtras,
    NO_COST_EXTRAS,
    ForeignPosition,
    ParsedInvestmentStatement,
    ParsedOperation
} from '../investment-statement.types';

const USD: string = 'USD';
const TRADE_KINDS: ReadonlySet<string> = new Set(['buy', 'sell']);

function tradedSymbolsOf(statement: ParsedInvestmentStatement): ReadonlySet<string> {
    return new Set(
        statement.operations
            .filter((operation: ParsedOperation): boolean => TRADE_KINDS.has(operation.kind))
            .map((operation: ParsedOperation): string => operation.ticker)
    );
}

function isPositive(value: string | null): boolean {
    return value !== null && DecimalUtil.of(value).gt(0);
}

function summaryOnlyOf(extras: ForeignExtras, traded: ReadonlySet<string>): ForeignPosition[] {
    const seen: Set<string> = new Set();
    return extras.positions.filter((position: ForeignPosition): boolean => {
        const eligible: boolean =
            position.block === FOREIGN_BLOCKS.equities &&
            isPositive(position.quantity) &&
            isPositive(position.price) &&
            !traded.has(position.symbol) &&
            !seen.has(position.symbol);
        seen.add(position.symbol);
        return eligible;
    });
}

function pricingOf(position: ForeignPosition, tradeDate: string): Pick<ParsedOperation, 'unitPrice' | 'grossMinor' | 'matchKey'> {
    const unitPrice: string = position.price ?? '0';
    return {
        unitPrice,
        grossMinor: toMinor(mulDecimal(position.quantity, unitPrice), USD),
        matchKey: [tradeDate, position.symbol, 'buy', position.quantity, unitPrice].join('|')
    };
}

function buyOf(position: ForeignPosition, tradeDate: string): ParsedOperation {
    return {
        sheet: '',
        line: 0,
        kind: 'buy',
        incomeKind: null,
        direction: 'credit',
        tradeDate,
        ticker: position.symbol,
        productName: null,
        institution: null,
        market: null,
        quantity: position.quantity,
        ...NO_COST_EXTRAS,
        ...pricingOf(position, tradeDate),
        currency: USD,
        appliedToPosition: true,
        alreadyImported: false,
        check: LINE_REASONS.assumedCost
    };
}

/**
 * A position that only shows in the portfolio summary of a foreign statement (no trade in the month) becomes a
 * buy at the start of the period, priced by the summary and flagged `assumed_cost` for the user to review.
 */
export function assumedOperationsOf(statement: ParsedInvestmentStatement): ParsedOperation[] {
    const extras: ForeignExtras | undefined = statement.foreign;
    const tradeDate: string | null = extras?.periodStart ?? extras?.periodEnd ?? null;
    if (extras === undefined || tradeDate === null) {
        return [];
    }
    return summaryOnlyOf(extras, tradedSymbolsOf(statement)).map((position: ForeignPosition): ParsedOperation =>
        buyOf(position, tradeDate)
    );
}
