export interface AvenueTrade {
    readonly date: string;
    readonly side: 'BUY' | 'SELL';
    readonly symbol: string;
    readonly securityId: string;
    readonly block: 'equities' | 'options' | 'fixed_income';
    readonly quantity: string;
    readonly price: string;
}

export interface AvenueDividend {
    readonly date: string;
    readonly symbol: string;
    readonly securityId: string;
    readonly grossMinor: number;
    readonly withheldMinor: number;
}

export interface AvenueFunds {
    readonly date: string;
    readonly direction: 'credit' | 'debit';
    readonly amountMinor: number;
}

export interface AvenuePosition {
    readonly block: 'equities' | 'options' | 'fixed_income';
    readonly symbol: string;
    readonly securityId: string;
    readonly quantity: string;
    readonly price: string;
}

export interface AvenueMonth {
    readonly slug: string;
    readonly start: string;
    readonly end: string;
    readonly trades: readonly AvenueTrade[];
    readonly dividends: readonly AvenueDividend[];
    readonly funds: readonly AvenueFunds[];
    readonly positions: readonly AvenuePosition[];
}

const AAPL: string = 'AAA111AA0';
const MSFT: string = 'BBB222BB0';
const KO: string = 'CCC333CC0';
const OPTION: string = 'DDD444DD0';
const NOTE: string = 'EEE555EE0';

export const AVENUE_MONTHS: readonly AvenueMonth[] = [
    {
        slug: '2026-07',
        start: '2026-07-01',
        end: '2026-07-31',
        trades: [
            { date: '2026-07-08', side: 'BUY', symbol: 'AAPL', securityId: AAPL, block: 'equities', quantity: '10', price: '190.00' },
            { date: '2026-07-15', side: 'BUY', symbol: 'MSFT', securityId: MSFT, block: 'equities', quantity: '5', price: '420.00' },
            {
                date: '2026-07-20',
                side: 'BUY',
                symbol: 'AAPL260821C00200000',
                securityId: OPTION,
                block: 'options',
                quantity: '1',
                price: '4.50'
            }
        ],
        dividends: [],
        funds: [{ date: '2026-07-02', direction: 'credit', amountMinor: 500000 }],
        positions: [
            { block: 'equities', symbol: 'AAPL', securityId: AAPL, quantity: '10', price: '192.00' },
            { block: 'equities', symbol: 'MSFT', securityId: MSFT, quantity: '5', price: '425.00' },
            { block: 'options', symbol: 'AAPL260821C00200000', securityId: OPTION, quantity: '1', price: '4.80' }
        ]
    },
    {
        slug: '2026-08',
        start: '2026-08-01',
        end: '2026-08-31',
        trades: [
            { date: '2026-08-05', side: 'BUY', symbol: 'AAPL', securityId: AAPL, block: 'equities', quantity: '5', price: '200.00' },
            { date: '2026-08-12', side: 'SELL', symbol: 'MSFT', securityId: MSFT, block: 'equities', quantity: '2', price: '430.00' },
            {
                date: '2026-08-25',
                side: 'BUY',
                symbol: 'UST4.25-2031',
                securityId: NOTE,
                block: 'fixed_income',
                quantity: '2000',
                price: '99.50'
            }
        ],
        dividends: [{ date: '2026-08-14', symbol: 'AAPL', securityId: AAPL, grossMinor: 240, withheldMinor: 72 }],
        funds: [{ date: '2026-08-20', direction: 'debit', amountMinor: 50000 }],
        positions: [
            { block: 'equities', symbol: 'AAPL', securityId: AAPL, quantity: '15', price: '201.00' },
            { block: 'equities', symbol: 'MSFT', securityId: MSFT, quantity: '3', price: '431.00' },
            { block: 'fixed_income', symbol: 'UST4.25-2031', securityId: NOTE, quantity: '2000', price: '99.60' }
        ]
    },
    {
        slug: '2026-09',
        start: '2026-09-01',
        end: '2026-09-30',
        trades: [
            { date: '2026-09-09', side: 'SELL', symbol: 'AAPL', securityId: AAPL, block: 'equities', quantity: '5', price: '210.00' },
            { date: '2026-09-22', side: 'BUY', symbol: 'KO', securityId: KO, block: 'equities', quantity: '8', price: '62.50' }
        ],
        dividends: [{ date: '2026-09-18', symbol: 'MSFT', securityId: MSFT, grossMinor: 300, withheldMinor: 90 }],
        funds: [{ date: '2026-09-01', direction: 'credit', amountMinor: 100000 }],
        positions: [
            { block: 'equities', symbol: 'AAPL', securityId: AAPL, quantity: '10', price: '208.00' },
            { block: 'equities', symbol: 'MSFT', securityId: MSFT, quantity: '3', price: '433.00' },
            { block: 'equities', symbol: 'KO', securityId: KO, quantity: '8', price: '63.00' },
            { block: 'fixed_income', symbol: 'UST4.25-2031', securityId: NOTE, quantity: '2000', price: '99.70' }
        ]
    }
];
