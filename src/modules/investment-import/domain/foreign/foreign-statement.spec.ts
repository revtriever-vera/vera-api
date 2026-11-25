import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { statementOfModelAnswers } from '../model/model-statement';
import { IgnoredLine, ParsedInvestmentStatement, ParsedOperation, StatementNote } from '../investment-statement.types';
import { foreignStatementOf, UsdRateTable, usdDatesOf } from './foreign-statement';

const FIXTURES: string = join(__dirname, '..', '..', '..', '..', '..', 'test', 'fixtures', 'investment-import', 'generated', 'avenue');

function answerOf(slug: string, change: (answer: Record<string, unknown>) => void = (): void => undefined): string {
    const parsed: Record<string, unknown> = JSON.parse(readFileSync(join(FIXTURES, `avenue-${slug}.expected.json`), 'utf8')) as Record<
        string,
        unknown
    >;
    change(parsed);
    return JSON.stringify(parsed);
}

function read(answer: string): ParsedInvestmentStatement {
    return statementOfModelAnswers([answer], { labels: ['text'], unreadPages: [], today: '2026-11-25' });
}

function ratesOf(entries: readonly [string, string, string][]): UsdRateTable {
    return new Map(entries.map(([date, brlPerUnit, rateDate]: [string, string, string]) => [date, { brlPerUnit, date: rateDate }]));
}

function noteCount(statement: ParsedInvestmentStatement, code: string): number {
    return statement.notes.find((note: StatementNote): boolean => note.code === code)?.count ?? 0;
}

function operationOf(statement: ParsedInvestmentStatement, ticker: string, kind: string): ParsedOperation {
    const found: ParsedOperation | undefined = statement.operations.find(
        (operation: ParsedOperation): boolean => operation.ticker === ticker && operation.kind === kind
    );
    if (found === undefined) {
        throw new Error(`missing ${ticker} ${kind}`);
    }
    return found;
}

const JULY_RATES: UsdRateTable = ratesOf([
    ['2026-07-08', '5.40', '2026-07-08'],
    ['2026-07-15', '5.50', '2026-07-15']
]);

describe('foreignStatementOf', () => {
    it('converts buys by the rate of the trade date and keeps the dollar price', () => {
        const statement: ParsedInvestmentStatement = foreignStatementOf(read(answerOf('2026-07')), JULY_RATES);
        const buy: ParsedOperation = operationOf(statement, 'AAPL', 'buy');
        expect(buy.currency).toBe('USD');
        expect(buy.unitPrice).toBe('190.00');
        expect(buy.dollar).toMatchObject({ fxRate: '5.40', grossBrlMinor: 1026000, withheldTaxMinor: null });
    });

    it('uses the previous business day rate and warns when the date has none', () => {
        const rates: UsdRateTable = ratesOf([
            ['2026-07-08', '5.40', '2026-07-07'],
            ['2026-07-15', '5.50', '2026-07-15']
        ]);
        const statement: ParsedInvestmentStatement = foreignStatementOf(read(answerOf('2026-07')), rates);
        expect(operationOf(statement, 'AAPL', 'buy').dollar?.fxRate).toBe('5.40');
        expect(noteCount(statement, 'foreign_rate_fallback')).toBe(1);
    });

    it('keeps the line without a BRL value and warns when no rate is usable', () => {
        const statement: ParsedInvestmentStatement = foreignStatementOf(read(answerOf('2026-07')), ratesOf([]));
        expect(operationOf(statement, 'AAPL', 'buy').dollar).toMatchObject({ fxRate: null, grossBrlMinor: null });
        expect(noteCount(statement, 'foreign_rate_missing')).toBe(2);
    });

    it('carries the gross and the withheld tax of a dividend separately', () => {
        const rates: UsdRateTable = ratesOf([
            ['2026-08-05', '5.00', '2026-08-05'],
            ['2026-08-12', '5.00', '2026-08-12'],
            ['2026-08-14', '5.10', '2026-08-14']
        ]);
        const statement: ParsedInvestmentStatement = foreignStatementOf(read(answerOf('2026-08')), rates);
        const income: ParsedOperation = operationOf(statement, 'AAPL', 'income');
        expect(income.grossMinor).toBe(240);
        expect(income.dollar).toMatchObject({ fxRate: '5.10', grossBrlMinor: 1224, withheldTaxMinor: 72 });
        expect(noteCount(statement, 'foreign_tax_unmatched')).toBe(0);
    });

    it('counts a withholding that matches no dividend', () => {
        const answer: string = answerOf('2026-08', (parsed: Record<string, unknown>): void => {
            parsed['taxWithholdings'] = [{ tradeDate: '2026-08-15', ticker: 'AAPL', amountMinor: 10 }];
        });
        expect(noteCount(foreignStatementOf(read(answer), ratesOf([])), 'foreign_tax_unmatched')).toBe(1);
    });

    it('sets aside options and fixed income with the unsupported market reason', () => {
        const july: ParsedInvestmentStatement = foreignStatementOf(read(answerOf('2026-07')), JULY_RATES);
        const august: ParsedInvestmentStatement = foreignStatementOf(read(answerOf('2026-08')), ratesOf([]));
        expect(july.operations.map((operation: ParsedOperation): string => operation.ticker)).not.toContain('AAPL260821C00200000');
        expect(july.ignored.filter((line: IgnoredLine): boolean => line.reason === 'unsupported_market')).toHaveLength(1);
        expect(august.ignored.filter((line: IgnoredLine): boolean => line.reason === 'unsupported_market')).toHaveLength(1);
    });

    it('turns funds paid and received into ignored cash movements without touching positions', () => {
        const statement: ParsedInvestmentStatement = foreignStatementOf(read(answerOf('2026-09')), ratesOf([]));
        expect(statement.ignored.filter((line: IgnoredLine): boolean => line.reason === 'cash_movement')).toHaveLength(1);
        expect(noteCount(statement, 'foreign_cash_movement')).toBe(1);
    });

    it('puts the summary quantity on the last trade of each symbol only', () => {
        const statement: ParsedInvestmentStatement = foreignStatementOf(read(answerOf('2026-09')), ratesOf([]));
        expect(operationOf(statement, 'AAPL', 'sell').dollar?.closingQuantity).toBe('10');
        expect(operationOf(statement, 'KO', 'buy').dollar?.closingQuantity).toBe('8');
        expect(operationOf(statement, 'MSFT', 'income').dollar?.closingQuantity).toBeNull();
    });

    it('proposes a check buy with the summary price for rows that no trade of the month explains', () => {
        const statement: ParsedInvestmentStatement = foreignStatementOf(
            read(answerOf('2026-09')),
            ratesOf([['2026-09-01', '5.00', '2026-09-01']])
        );
        const assumed: ParsedOperation = operationOf(statement, 'MSFT', 'buy');
        expect(assumed).toMatchObject({
            quantity: '3',
            unitPrice: '433.00',
            tradeDate: '2026-09-01',
            grossMinor: 129900,
            check: 'assumed_cost'
        });
        expect(assumed.dollar).toMatchObject({ fxRate: '5.00', grossBrlMinor: 649500 });
        expect(noteCount(statement, 'foreign_position_not_applied')).toBe(0);
    });

    it('counts a summary row without price as not applied', () => {
        const statement: ParsedInvestmentStatement = foreignStatementOf(
            read(
                answerOf('2026-09', (parsed: Record<string, unknown>): void => {
                    for (const position of parsed['positions'] as Record<string, unknown>[]) {
                        position['price'] = null;
                    }
                })
            ),
            ratesOf([])
        );
        expect(noteCount(statement, 'foreign_position_not_applied')).toBe(1);
        expect(statement.operations.some((operation: ParsedOperation): boolean => operation.check === 'assumed_cost')).toBe(false);
    });

    it('asks for the rate of the period start so the proposed buy can be converted', () => {
        const statement: ParsedInvestmentStatement = read(answerOf('2026-09'));
        expect(usdDatesOf(statement)).toContain('2026-09-01');
    });

    it('dedupes by an external reference that never carries plain text of the security id', () => {
        const statement: ParsedInvestmentStatement = foreignStatementOf(read(answerOf('2026-07')), JULY_RATES);
        expect(operationOf(statement, 'AAPL', 'buy').externalRef).toContain('AAA111AA0');
    });

    it('leaves statements that are not foreign untouched', () => {
        const note: ParsedInvestmentStatement = read(
            answerOf('2026-07', (parsed: Record<string, unknown>): void => {
                parsed['documentType'] = 'note';
            })
        );
        expect(foreignStatementOf(note, JULY_RATES)).toBe(note);
    });
});
