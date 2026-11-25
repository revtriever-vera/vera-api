import { AvenueDividend, AvenueFunds, AvenueMonth, AvenuePosition, AvenueTrade } from './avenue-data';

export interface ExpectedOperation {
    readonly kind: 'buy' | 'sell' | 'income';
    readonly incomeKind: 'dividend' | null;
    readonly direction: 'credit' | 'debit';
    readonly tradeDate: string;
    readonly ticker: string;
    readonly market: string;
    readonly securityId: string;
    readonly quantity: string;
    readonly unitPrice: string | null;
    readonly grossMinor: number;
    readonly currency: 'USD';
}

export interface ExpectedAnswer {
    readonly documentType: 'foreign_statement';
    readonly currency: 'USD';
    readonly periodStart: string;
    readonly periodEnd: string;
    readonly operations: readonly ExpectedOperation[];
    readonly positions: readonly { readonly block: string; readonly symbol: string; readonly quantity: string; readonly price: string }[];
    readonly taxWithholdings: readonly { readonly tradeDate: string; readonly ticker: string; readonly amountMinor: number }[];
    readonly cashMovements: readonly { readonly tradeDate: string; readonly direction: 'credit' | 'debit'; readonly amountMinor: number }[];
}

const MARKETS: Readonly<Record<AvenuePosition['block'], string>> = {
    equities: 'equities',
    options: 'option',
    fixed_income: 'fixed_income'
};

function grossOf(trade: AvenueTrade): number {
    return Math.round(Number(trade.quantity) * Number(trade.price) * 100) / (trade.block === 'fixed_income' ? 100 : 1);
}

function tradeOf(trade: AvenueTrade): ExpectedOperation {
    return {
        kind: trade.side === 'BUY' ? 'buy' : 'sell',
        incomeKind: null,
        direction: trade.side === 'BUY' ? 'credit' : 'debit',
        tradeDate: trade.date,
        ticker: trade.symbol,
        market: MARKETS[trade.block],
        securityId: trade.securityId,
        quantity: trade.quantity,
        unitPrice: trade.price,
        grossMinor: grossOf(trade),
        currency: 'USD'
    };
}

function dividendOf(item: AvenueDividend): ExpectedOperation {
    return {
        kind: 'income',
        incomeKind: 'dividend',
        direction: 'credit',
        tradeDate: item.date,
        ticker: item.symbol,
        market: 'equities',
        securityId: item.securityId,
        quantity: '0',
        unitPrice: null,
        grossMinor: item.grossMinor,
        currency: 'USD'
    };
}

function cashOf(item: AvenueFunds): ExpectedAnswer['cashMovements'][number] {
    return { tradeDate: item.date, direction: item.direction, amountMinor: item.amountMinor };
}

export function expectedAnswerOf(month: AvenueMonth): ExpectedAnswer {
    return {
        documentType: 'foreign_statement',
        currency: 'USD',
        periodStart: month.start,
        periodEnd: month.end,
        operations: [...month.trades.map(tradeOf), ...month.dividends.map(dividendOf)],
        positions: month.positions.map((item: AvenuePosition) => ({
            block: item.block,
            symbol: item.symbol,
            quantity: item.quantity,
            price: item.price
        })),
        taxWithholdings: month.dividends.map((item: AvenueDividend) => ({
            tradeDate: item.date,
            ticker: item.symbol,
            amountMinor: item.withheldMinor
        })),
        cashMovements: month.funds.map(cashOf)
    };
}
