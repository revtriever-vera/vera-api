import { brDate, money } from './report-format';
import { SheetTable } from './sheet.types';
import { SYNTHETIC_BROKER } from './synthetic-identity';

interface Trade {
    readonly date: string;
    readonly side: 'Compra' | 'Venda';
    readonly market: string;
    readonly ticker: string;
    readonly quantity: number;
    readonly price: number;
}

const SPOT: string = 'Mercado à Vista';
const FRACTIONAL: string = 'Mercado Fracionário';

const TRADES: readonly Trade[] = [
    { date: '2025-02-10', side: 'Compra', market: SPOT, ticker: 'PETR4', quantity: 200, price: 36.1 },
    { date: '2025-03-04', side: 'Compra', market: SPOT, ticker: 'VALE3', quantity: 150, price: 58.4 },
    { date: '2025-03-18', side: 'Compra', market: SPOT, ticker: 'ITUB4', quantity: 300, price: 31.75 },
    { date: '2025-05-12', side: 'Compra', market: SPOT, ticker: 'BOVA11', quantity: 50, price: 121.3 },
    { date: '2025-06-23', side: 'Compra', market: SPOT, ticker: 'HGLG11', quantity: 60, price: 152.9 },
    { date: '2025-08-05', side: 'Compra', market: SPOT, ticker: 'AAPL34', quantity: 80, price: 52.2 },
    { date: '2025-09-15', side: 'Venda', market: SPOT, ticker: 'ITUB4', quantity: 100, price: 34.9 },
    { date: '2025-11-03', side: 'Compra', market: SPOT, ticker: 'XPML11', quantity: 90, price: 107.6 },
    { date: '2026-01-19', side: 'Compra', market: FRACTIONAL, ticker: 'PETR4F', quantity: 7, price: 37.05 },
    { date: '2026-03-09', side: 'Compra', market: SPOT, ticker: 'IVVB11', quantity: 40, price: 301.4 },
    { date: '2026-06-22', side: 'Venda', market: SPOT, ticker: 'VALE3', quantity: 50, price: 63.15 },
    { date: '2026-08-14', side: 'Compra', market: SPOT, ticker: 'ITUB4', quantity: 100, price: 33.2 }
];

const HEADERS: readonly string[] = [
    'Data do Negócio',
    'Tipo de Movimentação',
    'Mercado',
    'Prazo/Vencimento',
    'Instituição',
    'Código de Negociação',
    'Quantidade',
    'Preço',
    'Valor'
];

export function buildTradesSheet(): SheetTable {
    return {
        name: 'Negociação',
        slug: 'negociacao',
        headers: HEADERS,
        rows: TRADES.map((trade: Trade): (string | number)[] => [
            brDate(trade.date),
            trade.side,
            trade.market,
            '-',
            SYNTHETIC_BROKER,
            trade.ticker,
            trade.quantity,
            trade.price,
            money(trade.quantity * trade.price)
        ])
    };
}
