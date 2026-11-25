import { currencyExponent, DecimalUtil, mulDecimal, toMinor } from '../../../../shared/utils/decimal.util';
import { NOTE_CODES } from '../investment-import.types';
import { assumedOperationsOf } from './foreign-summary';
import {
    DOCUMENT_TYPES,
    DollarFacts,
    FOREIGN_BLOCKS,
    ForeignExtras,
    ForeignPosition,
    ForeignWithholding,
    IGNORE_REASONS,
    IgnoredLine,
    ParsedInvestmentStatement,
    ParsedOperation,
    StatementNote
} from '../investment-statement.types';

export const USD: string = 'USD';
export const BRL: string = 'BRL';
export const MAX_RATE_AGE_DAYS: number = 7;
const DAY_MS: number = 86_400_000;
const INCOME_KIND: string = 'income';
const TRADE_KINDS: ReadonlySet<string> = new Set(['buy', 'sell']);

export interface UsdRate {
    readonly brlPerUnit: string;
    readonly date: string;
}

export type UsdRateTable = ReadonlyMap<string, UsdRate>;

interface Tally {
    fallback: number;
    missing: number;
    unmatchedTax: number;
}

export function isForeignStatement(statement: ParsedInvestmentStatement): boolean {
    return statement.documentType === DOCUMENT_TYPES.foreignStatement && statement.foreign !== undefined && statement.currency === USD;
}

export function usdDatesOf(statement: ParsedInvestmentStatement): string[] {
    const dates: string[] = [...statement.operations, ...assumedOperationsOf(statement)].map(
        (operation: ParsedOperation): string => operation.tradeDate
    );
    return [...new Set(dates)];
}

export function rateIsUsable(tradeDate: string, rateDate: string): boolean {
    const age: number = (Date.parse(`${tradeDate}T00:00:00Z`) - Date.parse(`${rateDate}T00:00:00Z`)) / DAY_MS;
    return age >= 0 && age <= MAX_RATE_AGE_DAYS;
}

function usdMajorOf(minor: number): string {
    return DecimalUtil.of(minor)
        .div(DecimalUtil.of(10).pow(currencyExponent(USD)))
        .toFixed();
}

function grossUsdMinorOf(operation: ParsedOperation): number | null {
    if (operation.grossMinor !== null) {
        return operation.grossMinor;
    }
    return operation.unitPrice === null ? null : toMinor(mulDecimal(operation.quantity, operation.unitPrice), USD);
}

function brlMinorOf(usdMinor: number | null, rate: UsdRate | undefined): number | null {
    if (usdMinor === null || rate === undefined) {
        return null;
    }
    return toMinor(mulDecimal(usdMajorOf(usdMinor), rate.brlPerUnit), BRL);
}

function withholdingKeyOf(tradeDate: string, ticker: string): string {
    return `${tradeDate}|${ticker}`;
}

function withholdingsByKey(withholdings: readonly ForeignWithholding[]): Map<string, number> {
    const totals: Map<string, number> = new Map();
    for (const item of withholdings) {
        const key: string = withholdingKeyOf(item.tradeDate, item.ticker);
        totals.set(key, (totals.get(key) ?? 0) + item.amountMinor);
    }
    return totals;
}

function closingQuantitiesOf(extras: ForeignExtras): Map<string, string> {
    const equities: ForeignPosition[] = extras.positions.filter(
        (position: ForeignPosition): boolean => position.block === FOREIGN_BLOCKS.equities
    );
    return new Map(equities.map((position: ForeignPosition): [string, string] => [position.symbol, position.quantity]));
}

function lastTradeIndexes(operations: readonly ParsedOperation[]): Map<string, number> {
    const last: Map<string, number> = new Map();
    operations.forEach((operation: ParsedOperation, index: number): void => {
        if (!TRADE_KINDS.has(operation.kind)) {
            return;
        }
        const previous: number | undefined = last.get(operation.ticker);
        const earlier: ParsedOperation | undefined = previous === undefined ? undefined : operations[previous];
        if (earlier === undefined || earlier.tradeDate <= operation.tradeDate) {
            last.set(operation.ticker, index);
        }
    });
    return last;
}

interface Context {
    readonly rates: UsdRateTable;
    readonly tally: Tally;
    readonly withheld: Map<string, number>;
    readonly closing: ReadonlyMap<string, string>;
    readonly lastTrade: ReadonlyMap<string, number>;
}

function withheldOf(context: Context, operation: ParsedOperation): number | null {
    if (operation.kind !== INCOME_KIND) {
        return null;
    }
    const key: string = withholdingKeyOf(operation.tradeDate, operation.ticker);
    const amount: number | undefined = context.withheld.get(key);
    context.withheld.delete(key);
    return amount ?? null;
}

function dollarOf(context: Context, operation: ParsedOperation, index: number): DollarFacts {
    const rate: UsdRate | undefined = context.rates.get(operation.tradeDate);
    context.tally.missing += rate === undefined ? 1 : 0;
    context.tally.fallback += rate !== undefined && rate.date !== operation.tradeDate ? 1 : 0;
    const isClosing: boolean = context.lastTrade.get(operation.ticker) === index;
    return {
        fxRate: rate?.brlPerUnit ?? null,
        grossBrlMinor: brlMinorOf(grossUsdMinorOf(operation), rate),
        withheldTaxMinor: withheldOf(context, operation),
        closingQuantity: isClosing ? (context.closing.get(operation.ticker) ?? null) : null
    };
}

function cashIgnoredOf(extras: ForeignExtras): IgnoredLine[] {
    return extras.cashMovements.map((movement): IgnoredLine => ({
        sheet: '',
        line: 0,
        reason: IGNORE_REASONS.cashMovement,
        description: '',
        tradeDate: movement.tradeDate,
        productCode: null
    }));
}

function notesOf(tally: Tally, extras: ForeignExtras, unapplied: number): StatementNote[] {
    const candidates: readonly StatementNote[] = [
        { code: NOTE_CODES.foreignRateFallback, count: tally.fallback },
        { code: NOTE_CODES.foreignRateMissing, count: tally.missing },
        { code: NOTE_CODES.foreignTaxUnmatched, count: tally.unmatchedTax },
        { code: NOTE_CODES.foreignCashMovement, count: extras.cashMovements.length },
        { code: NOTE_CODES.foreignPositionNotApplied, count: unapplied }
    ];
    return candidates.filter((note: StatementNote): boolean => note.count > 0);
}

function unappliedOf(operations: readonly ParsedOperation[], closing: ReadonlyMap<string, string>): number {
    const traded: Set<string> = new Set(
        operations
            .filter((operation: ParsedOperation): boolean => TRADE_KINDS.has(operation.kind))
            .map((operation: ParsedOperation): string => operation.ticker)
    );
    return [...closing.keys()].filter((symbol: string): boolean => !traded.has(symbol)).length;
}

function contextOf(rates: UsdRateTable, extras: ForeignExtras, operations: readonly ParsedOperation[]): Context {
    return {
        rates,
        tally: { fallback: 0, missing: 0, unmatchedTax: 0 },
        withheld: withholdingsByKey(extras.withholdings),
        closing: closingQuantitiesOf(extras),
        lastTrade: lastTradeIndexes(operations)
    };
}

export function foreignStatementOf(statement: ParsedInvestmentStatement, rates: UsdRateTable): ParsedInvestmentStatement {
    const extras: ForeignExtras | undefined = statement.foreign;
    if (extras === undefined || !isForeignStatement(statement)) {
        return statement;
    }
    const all: ParsedOperation[] = [...statement.operations, ...assumedOperationsOf(statement)];
    const context: Context = contextOf(rates, extras, all);
    const operations: ParsedOperation[] = all.map((operation: ParsedOperation, index: number): ParsedOperation => ({
        ...operation,
        dollar: dollarOf(context, operation, index)
    }));
    context.tally.unmatchedTax = context.withheld.size;
    return {
        ...statement,
        operations,
        ignored: [...statement.ignored, ...cashIgnoredOf(extras)],
        notes: [...statement.notes, ...notesOf(context.tally, extras, unappliedOf(operations, context.closing))]
    };
}
