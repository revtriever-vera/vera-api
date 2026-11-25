export type CryptoFile = readonly [string, Buffer];

const BINANCE_TRADE_HEADER: readonly string[] = ['Date(UTC)', 'Pair', 'Side', 'Price', 'Executed', 'Amount', 'Fee'];
const BINANCE_TRADE_REORDERED: readonly string[] = ['Fee', 'Side', 'Pair', 'Date(UTC)', 'Amount', 'Executed', 'Price'];

const BINANCE_TRADES: readonly (readonly string[])[] = [
    ['2025-03-04 14:22:10', 'BTCBRL', 'BUY', '350000.00', '0.01000000BTC', '3500.00000000BRL', '0.00001000BTC'],
    ['2025-04-10 09:00:00', 'ETHBRL', 'BUY', '12000.00', '0.50000000ETH', '6000.00000000BRL', '6.00000000BRL'],
    ['2025-05-20 18:30:00', 'BTCUSDT', 'SELL', '70000.00', '0.00500000BTC', '350.00000000USDT', '0.35000000USDT'],
    ['2025-06-02 02:15:00', 'BTCBRL', 'SELL', '360000.00', '0.00400000BTC', '1440.00000000BRL', '1.44000000BRL'],
    ['2025-07-01 12:00:00', 'ETHBTC', 'BUY', '0.05', '1.00000000ETH', '0.05000000BTC', '0.00100000BNB'],
    ['2025-08-01 10:00:00', 'SOLBRL', 'BUY', '800.00', '2.00000000SOL', '1600.00000000BRL', '0.00200000BNB']
];

const BINANCE_STATEMENT: readonly (readonly string[])[] = [
    ['UTC_Time', 'Account', 'Operation', 'Coin', 'Change', 'Remark'],
    ['2025-03-03 10:00:00', 'Spot', 'Deposit', 'BTC', '0.02000000', ''],
    ['2025-06-10 11:00:00', 'Spot', 'Withdraw', 'BTC', '-0.00500000', ''],
    ['2025-07-15 03:00:00', 'Earn', 'Simple Earn Flexible Interest', 'ETH', '0.00020000', ''],
    ['2025-08-20 03:00:00', 'Spot', 'Staking Rewards', 'SOL', '0.01000000', ''],
    ['2025-09-01 00:00:00', 'Spot', 'Airdrop Assets', 'BNB', '0.10000000', ''],
    ['2025-09-02 00:00:00', 'Spot', 'Transaction Fee', 'BNB', '-0.00100000', '']
];

const MERCADO_BITCOIN: readonly (readonly string[])[] = [
    ['ID da ordem', 'Data (UTC)', 'Tipo', 'Par', 'Quantidade', 'Preço unitário', 'Valor total', 'Taxa', 'Moeda da taxa'],
    ['MB-1001', '2025-02-14 13:05:00', 'Compra', 'BTC-BRL', '0,00500000', '340000,00', '1700,00', '0,00000500', 'BTC'],
    ['MB-1002', '2025-03-01 15:00:00', 'Venda', 'ETH-BRL', '0,25000000', '11800,00', '2950,00', '11,80', 'BRL'],
    ['MB-1003', '2025-03-05 10:00:00', 'Depósito', 'BTC', '0,01000000', '', '', '', ''],
    ['MB-1004', '2025-03-06 10:00:00', 'Saque', 'BTC', '0,00500000', '', '', '', ''],
    ['MB-1005', '2025-03-07 10:00:00', 'Depósito', 'BRL', '2000,00', '', '', '', ''],
    ['MB-1006', '2025-04-01 10:00:00', 'Rendimento', 'ETH', '0,00100000', '', '', '', '']
];

const COINBASE_PREAMBLE: readonly string[] = ['', 'Transactions', 'User,Pessoa Exemplo,00000000-0000-0000-0000-000000000000'];

const COINBASE: readonly (readonly string[])[] = [
    [
        'ID',
        'Timestamp',
        'Transaction Type',
        'Asset',
        'Quantity Transacted',
        'Price Currency',
        'Price at Transaction',
        'Subtotal',
        'Total (inclusive of fees and/or spread)',
        'Fees and/or Spread',
        'Notes'
    ],
    ['cb-0001', '2025-04-02T15:30:00Z', 'Buy', 'BTC', '0.002', 'BRL', '330000.00', '660.00', '666.60', '6.60', 'Bought 0.002 BTC'],
    [
        'cb-0002',
        '2025-05-05T10:00:00Z',
        'Convert',
        'ETH',
        '0.5',
        'BRL',
        '12500.00',
        '6250.00',
        '6275.00',
        '25.00',
        'Converted 0.5 ETH to 0.02 BTC'
    ],
    ['cb-0003', '2025-05-06T10:00:00Z', 'Sell', 'BTC', '0.001', 'BRL', '350000.00', '350.00', '346.50', '3.50', 'Sold 0.001 BTC'],
    ['cb-0004', '2025-05-07T10:00:00Z', 'Receive', 'BTC', '0.01', 'BRL', '350000.00', '3500.00', '3500.00', '0.00', 'Received 0.01 BTC'],
    ['cb-0005', '2025-05-08T10:00:00Z', 'Send', 'BTC', '0.002', 'BRL', '350000.00', '700.00', '700.00', '0.00', 'Sent 0.002 BTC'],
    ['cb-0006', '2025-05-09T10:00:00Z', 'Staking Income', 'ETH', '0.0005', 'BRL', '12000.00', '6.00', '6.00', '0.00', ''],
    ['cb-0007', '2025-05-10T10:00:00Z', 'Deposit', 'BRL', '500', 'BRL', '1.00', '500.00', '500.00', '0.00', ''],
    ['cb-0008', '2025-06-10T10:00:00Z', 'Buy', 'SOL', '1.5', 'USD', '150.00', '225.00', '227.25', '2.25', 'Bought 1.5 SOL']
];

function csvOf(rows: readonly (readonly string[])[], separator: string): Buffer {
    return Buffer.from(`${rows.map((row: readonly string[]): string => row.join(separator)).join('\n')}\n`, 'utf8');
}

function reordered(): (readonly string[])[] {
    const order: number[] = BINANCE_TRADE_REORDERED.map((name: string): number => BINANCE_TRADE_HEADER.indexOf(name));
    const pick = (row: readonly string[]): string[] => order.map((index: number): string => row[index] ?? '');
    return [[...BINANCE_TRADE_REORDERED], ...BINANCE_TRADES.map(pick)];
}

export function buildCryptoExports(): CryptoFile[] {
    return [
        ['crypto/binance-trades.csv', csvOf([[...BINANCE_TRADE_HEADER], ...BINANCE_TRADES], ',')],
        ['crypto/binance-trades-reordered.csv', csvOf(reordered(), ',')],
        ['crypto/binance-statement.csv', csvOf(BINANCE_STATEMENT, ',')],
        ['crypto/mercado-bitcoin.csv', csvOf(MERCADO_BITCOIN, ';')],
        ['crypto/coinbase.csv', csvOf([...COINBASE_PREAMBLE.map((line: string): string[] => [line]), ...COINBASE], ',')]
    ];
}
