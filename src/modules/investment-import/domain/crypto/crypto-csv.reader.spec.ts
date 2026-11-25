import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FormatNotRecognizedError } from '../investment-import.errors';
import { ParsedInvestmentStatement, ParsedOperation } from '../investment-statement.types';
import { storedLinesOf } from '../preview-lines';
import { StoredLine } from '../investment-import.types';
import { readCryptoCsv } from './crypto-csv.reader';
import { CryptoReading, UsdRates } from './crypto-events.types';
import { cryptoStatementOf, usdDatesOf } from './crypto-statement';
import { readB3Report } from '../b3/b3-file.reader';

const FIXTURES: string = join(__dirname, '..', '..', '..', '..', '..', 'test', 'fixtures', 'investment-import', 'generated', 'crypto');
const RATES: UsdRates = new Map([
    ['2025-05-20', '5.5'],
    ['2025-06-10', '5.6']
]);

function statementOf(name: string, rates: UsdRates = RATES): ParsedInvestmentStatement {
    const reading: CryptoReading | null = readCryptoCsv(readFileSync(join(FIXTURES, name)));
    if (reading === null) {
        throw new Error(`not recognized: ${name}`);
    }
    return cryptoStatementOf(reading, rates);
}

function operation(statement: ParsedInvestmentStatement, ticker: string, kind: string, tradeDate?: string): ParsedOperation {
    const found: ParsedOperation | undefined = statement.operations.find(
        (candidate: ParsedOperation): boolean =>
            candidate.ticker === ticker && candidate.kind === kind && (tradeDate === undefined || candidate.tradeDate === tradeDate)
    );
    if (found === undefined) {
        throw new Error(`missing ${ticker} ${kind}`);
    }
    return found;
}

describe('Binance trade history', () => {
    const statement: ParsedInvestmentStatement = statementOf('binance-trades.csv');

    it('reads a purchase against BRL and takes the fee in the bought crypto out of the quantity', () => {
        expect(operation(statement, 'BTC', 'buy', '2025-03-04')).toMatchObject({
            kind: 'buy',
            direction: 'credit',
            quantity: '0.00999',
            grossMinor: 350000,
            feesMinor: 0,
            institution: 'Binance',
            currency: 'BRL'
        });
    });

    it('takes a BRL fee into the cost as feesMinor', () => {
        expect(operation(statement, 'ETH', 'buy')).toMatchObject({ quantity: '0.5', grossMinor: 600000, feesMinor: 600 });
    });

    it('turns a sale against a stablecoin into a sale and a purchase valued by the dollar and the PTAX of the day', () => {
        const sale: ParsedOperation = operation(statement, 'BTC', 'sell', '2025-05-20');
        const purchase: ParsedOperation = operation(statement, 'USDT', 'buy');
        expect(sale).toMatchObject({ quantity: '0.005', grossMinor: 192500, direction: 'debit' });
        expect(purchase).toMatchObject({ quantity: '349.65', grossMinor: 192500, direction: 'credit' });
        expect(statement.notes).toContainEqual({ code: 'crypto_usd_rate_applied', count: 1 });
    });

    it('uses the Brazil date for a trade that happened after 21h there', () => {
        expect(operation(statement, 'BTC', 'sell', '2025-06-01')).toMatchObject({ grossMinor: 144000, feesMinor: 144 });
    });

    it('rejects a crypto to crypto pair without a BRL or dollar value', () => {
        expect(statement.rejected).toEqual([{ sheet: '', line: 6, reason: 'invalid_amount' }]);
    });

    it('keeps a fee in a third crypto out of the cost and counts it', () => {
        expect(operation(statement, 'SOL', 'buy')).toMatchObject({ quantity: '2', feesMinor: 0 });
        expect(statement.notes).toContainEqual({ code: 'crypto_fee_not_converted', count: 1 });
    });

    it('needs the dollar rate only on the dates that use a dollar asset', () => {
        const reading: CryptoReading | null = readCryptoCsv(readFileSync(join(FIXTURES, 'binance-trades.csv')));
        expect(reading === null ? [] : usdDatesOf(reading)).toEqual(['2025-05-20']);
    });

    it('rejects the dollar-valued pair when the rate of the day is missing', () => {
        const without: ParsedInvestmentStatement = statementOf('binance-trades.csv', new Map());
        expect(without.rejected.map((line) => line.reason)).toEqual(['invalid_amount', 'invalid_amount']);
    });
});

describe('column order', () => {
    it('reads the same trades when the columns come in another order', () => {
        const base: ParsedInvestmentStatement = statementOf('binance-trades.csv');
        const other: ParsedInvestmentStatement = statementOf('binance-trades-reordered.csv');
        expect(other.operations.map((item: ParsedOperation): string => item.matchKey)).toEqual(
            base.operations.map((item: ParsedOperation): string => item.matchKey)
        );
        expect(other.operations.length).toBeGreaterThan(0);
    });
});

describe('Binance statement', () => {
    const statement: ParsedInvestmentStatement = statementOf('binance-statement.csv');

    it('keeps deposits and withdrawals as transfers with no effect on the position', () => {
        const deposit: ParsedOperation = operation(statement, 'BTC', 'transfer', '2025-03-03');
        expect(deposit).toMatchObject({ direction: 'credit', quantity: '0.02', appliedToPosition: false, grossMinor: null });
        expect(statement.operations.filter((item: ParsedOperation): boolean => item.kind === 'transfer')).toHaveLength(2);
        expect(statement.notes).toContainEqual({ code: 'crypto_transfer_check', count: 2 });
    });

    it('reads staking, interest and airdrop as income and ignores other operations', () => {
        const incomes: ParsedOperation[] = statement.operations.filter((item: ParsedOperation): boolean => item.kind === 'income');
        expect(incomes.map((item: ParsedOperation) => [item.ticker, item.incomeKind])).toEqual([
            ['ETH', 'interest'],
            ['SOL', 'staking'],
            ['BNB', 'staking']
        ]);
        expect(statement.ignored).toHaveLength(1);
    });
});

describe('Mercado Bitcoin', () => {
    const statement: ParsedInvestmentStatement = statementOf('mercado-bitcoin.csv');

    it('reads purchase and sale with the fee in crypto and in BRL', () => {
        expect(operation(statement, 'BTC', 'buy')).toMatchObject({ quantity: '0.004995', grossMinor: 170000, feesMinor: 0 });
        expect(operation(statement, 'ETH', 'sell')).toMatchObject({ quantity: '0.25', grossMinor: 295000, feesMinor: 1180 });
    });

    it('keeps crypto deposit and withdrawal as transfers and ignores the BRL deposit', () => {
        expect(statement.operations.filter((item: ParsedOperation): boolean => item.kind === 'transfer')).toHaveLength(2);
        expect(statement.ignored).toHaveLength(1);
        expect(operation(statement, 'ETH', 'income')).toMatchObject({ incomeKind: 'interest', quantity: '0.001' });
    });

    it('keeps the exchange order id only as the dedupe reference, never in the matchKey', () => {
        const buy: ParsedOperation = operation(statement, 'BTC', 'buy');
        expect(buy.externalRef).toBe('Mercado Bitcoin:MB-1001:buy:BTC');
        expect(buy.matchKey).not.toContain('MB-1001');
    });
});

describe('Coinbase', () => {
    const statement: ParsedInvestmentStatement = statementOf('coinbase.csv');

    it('finds the header after the preamble and reads buy and sell with the fee in BRL', () => {
        expect(operation(statement, 'BTC', 'buy', '2025-04-02')).toMatchObject({ quantity: '0.002', grossMinor: 66000, feesMinor: 660 });
        expect(operation(statement, 'BTC', 'sell')).toMatchObject({ quantity: '0.001', grossMinor: 35000, feesMinor: 350 });
    });

    it('turns a convert between cryptos into two operations valued by the fiat subtotal, with the fee on the first', () => {
        const sold: ParsedOperation = operation(statement, 'ETH', 'sell');
        const bought: ParsedOperation = operation(statement, 'BTC', 'buy', '2025-05-05');
        expect(sold).toMatchObject({ quantity: '0.5', grossMinor: 625000, feesMinor: 2500 });
        expect(bought).toMatchObject({ quantity: '0.02', grossMinor: 625000, feesMinor: 0 });
    });

    it('keeps send and receive as transfers and staking income with its value', () => {
        expect(
            statement.operations.filter((item: ParsedOperation): boolean => item.kind === 'transfer').map((item) => item.direction)
        ).toEqual(['credit', 'debit']);
        expect(operation(statement, 'ETH', 'income')).toMatchObject({ incomeKind: 'staking', grossMinor: 600 });
        expect(statement.ignored).toHaveLength(1);
    });

    it('values a purchase priced in dollars by the PTAX of the day', () => {
        expect(operation(statement, 'SOL', 'buy')).toMatchObject({ quantity: '1.5', grossMinor: 126000, feesMinor: 1260 });
    });
});

describe('dedupe', () => {
    it('gives each line the same source reference when the same file is read again', () => {
        const first: StoredLine[] = storedLinesOf(statementOf('mercado-bitcoin.csv'));
        const second: StoredLine[] = storedLinesOf(statementOf('mercado-bitcoin.csv'));
        expect(second.map((line: StoredLine): string => line.sourceRef)).toEqual(first.map((line: StoredLine): string => line.sourceRef));
        expect(new Set(first.map((line: StoredLine): string => line.sourceRef)).size).toBe(first.length);
        expect(first.every((line: StoredLine): boolean => line.market === 'CRYPTO' && line.sourceRef.startsWith('crypto_csv:'))).toBe(true);
    });

    it('does not put the exchange order id in the source reference', () => {
        const lines: StoredLine[] = storedLinesOf(statementOf('coinbase.csv'));
        expect(lines.some((line: StoredLine): boolean => line.sourceRef.includes('cb-0001'))).toBe(false);
    });

    it('numbers repeated lines of a file without ids so that the second is not dropped', () => {
        const statement: ParsedInvestmentStatement = statementOf('binance-trades.csv');
        const doubled: ParsedInvestmentStatement = { ...statement, operations: [...statement.operations, ...statement.operations] };
        const refs: string[] = storedLinesOf(doubled).map((line: StoredLine): string => line.sourceRef);
        expect(new Set(refs).size).toBe(refs.length);
    });
});

describe('other files', () => {
    it('does not take a B3 report for a crypto export', async () => {
        const csv: Buffer = Buffer.from(
            'Data do Negócio;Tipo de Movimentação;Código de Negociação;Quantidade;Preço\n10/01/2026;Compra;PETR4;10;5\n'
        );
        expect(readCryptoCsv(csv)).toBeNull();
        await expect(readB3Report(csv)).resolves.toMatchObject({ source: 'b3' });
    });

    it('answers format.not_recognized for a file of another kind', async () => {
        const text: Buffer = Buffer.from('nome;valor\nalgo;1\n');
        expect(readCryptoCsv(text)).toBeNull();
        await expect(readB3Report(text)).rejects.toBeInstanceOf(FormatNotRecognizedError);
    });

    it('does not read a PDF as a crypto export', () => {
        expect(readCryptoCsv(Buffer.from('%PDF-1.4\n'))).toBeNull();
    });
});
