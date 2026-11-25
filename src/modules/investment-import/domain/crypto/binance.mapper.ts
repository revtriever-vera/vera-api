import { IGNORE_REASONS, IncomeKind, REJECT_REASONS, RejectReason } from '../investment-statement.types';
import { normalizeText, RawRow, RawTable, textOf } from '../b3/b3-cells';
import { cellAt, column, ColumnSpec, HeaderMatch, textAt } from '../b3/b3-columns';
import { accept, Collected, collectRows, ignore, reject, RowResult } from '../b3/b3-rows';
import { absolute, amountWithUnitOf, englishDecimalOf, isPositive, utcTradeDateOf } from './crypto-cells';
import { CryptoAmount, CryptoEvent, TransferEvent } from './crypto-events.types';

export type BinanceTradeColumn = 'date' | 'pair' | 'side' | 'executed' | 'amount' | 'fee' | 'feeCoin';

export const BINANCE_TRADE_SPEC: ColumnSpec<BinanceTradeColumn> = {
    date: column(true, 'Date(UTC)'),
    pair: column(true, 'Pair'),
    side: column(true, 'Side'),
    executed: column(true, 'Executed'),
    amount: column(true, 'Amount'),
    fee: column(false, 'Fee'),
    feeCoin: column(false, 'Fee Coin')
};

export type BinanceStatementColumn = 'date' | 'operation' | 'coin' | 'change';

export const BINANCE_STATEMENT_SPEC: ColumnSpec<BinanceStatementColumn> = {
    date: column(true, 'UTC_Time'),
    operation: column(true, 'Operation'),
    coin: column(true, 'Coin'),
    change: column(true, 'Change')
};

const SIDES: ReadonlySet<string> = new Set(['buy', 'sell']);

const INCOME_OPERATIONS: Readonly<Record<string, IncomeKind>> = {
    'staking rewards': 'staking',
    'airdrop assets': 'staking',
    'launchpool earnings': 'staking',
    'simple earn flexible interest': 'interest',
    'simple earn locked rewards': 'interest',
    'savings interest': 'interest',
    'pos savings interest': 'interest'
};

const TRANSFER_OPERATIONS: Readonly<Record<string, 'credit' | 'debit'>> = { deposit: 'credit', withdraw: 'debit' };

function feeOf(row: RawRow, match: HeaderMatch<BinanceTradeColumn>): CryptoAmount | null {
    const withUnit: CryptoAmount | null = amountWithUnitOf(cellAt(row, match, 'fee'));
    if (withUnit !== null) {
        return isPositive(withUnit.quantity) ? withUnit : null;
    }
    const quantity: string | null = englishDecimalOf(cellAt(row, match, 'fee'));
    const asset: string = textAt(row, match, 'feeCoin').toUpperCase();
    return isPositive(quantity) && asset !== '' ? { asset, quantity } : null;
}

interface TradeFacts {
    readonly tradeDate: string | null;
    readonly side: string;
    readonly executed: CryptoAmount | null;
    readonly amount: CryptoAmount | null;
}

function factsOf(row: RawRow, match: HeaderMatch<BinanceTradeColumn>): TradeFacts {
    return {
        tradeDate: utcTradeDateOf(cellAt(row, match, 'date')),
        side: textAt(row, match, 'side').toLowerCase(),
        executed: amountWithUnitOf(cellAt(row, match, 'executed')),
        amount: amountWithUnitOf(cellAt(row, match, 'amount'))
    };
}

function faultOf(facts: TradeFacts): RejectReason | null {
    if (facts.tradeDate === null) {
        return REJECT_REASONS.invalidDate;
    }
    if (!SIDES.has(facts.side)) {
        return REJECT_REASONS.invalidSide;
    }
    const complete: boolean = [facts.executed, facts.amount].every(
        (amount: CryptoAmount | null): boolean => amount !== null && isPositive(amount.quantity)
    );
    return complete ? null : REJECT_REASONS.invalidQuantity;
}

function exchangeOf(
    row: RawRow,
    match: HeaderMatch<BinanceTradeColumn>,
    tradeDate: string,
    facts: TradeFacts & { executed: CryptoAmount; amount: CryptoAmount }
): CryptoEvent {
    const buying: boolean = facts.side === 'buy';
    return {
        kind: 'exchange',
        line: row.line,
        tradeDate,
        externalId: null,
        sold: buying ? facts.amount : facts.executed,
        bought: buying ? facts.executed : facts.amount,
        valuation: null,
        fee: feeOf(row, match)
    };
}

function parseTrade(row: RawRow, match: HeaderMatch<BinanceTradeColumn>, sheet: string): RowResult<CryptoEvent> {
    const facts: TradeFacts = factsOf(row, match);
    const fault: RejectReason | null = faultOf(facts);
    if (fault !== null || facts.tradeDate === null || facts.executed === null || facts.amount === null) {
        return reject(sheet, row, fault ?? REJECT_REASONS.invalidDate);
    }
    return accept(exchangeOf(row, match, facts.tradeDate, { ...facts, executed: facts.executed, amount: facts.amount }));
}

interface OperationFacts {
    readonly tradeDate: string | null;
    readonly asset: string;
    readonly change: string | null;
}

function operationFaultOf(facts: OperationFacts): RejectReason | null {
    if (facts.tradeDate === null) {
        return REJECT_REASONS.invalidDate;
    }
    if (facts.asset === '') {
        return REJECT_REASONS.missingAsset;
    }
    return facts.change === null || !isPositive(absolute(facts.change)) ? REJECT_REASONS.invalidQuantity : null;
}

function operationEventOf(
    row: RawRow,
    facts: OperationFacts & { tradeDate: string; change: string },
    kinds: { incomeKind: IncomeKind | undefined; direction: 'credit' | 'debit' | undefined }
): CryptoEvent {
    const base: Pick<TransferEvent, 'line' | 'tradeDate' | 'externalId'> = { line: row.line, tradeDate: facts.tradeDate, externalId: null };
    const moved: CryptoAmount = { asset: facts.asset, quantity: absolute(facts.change) };
    if (kinds.incomeKind !== undefined) {
        return { ...base, kind: 'income', incomeKind: kinds.incomeKind, received: moved, valuation: null };
    }
    return { ...base, kind: 'transfer', direction: kinds.direction ?? 'credit', moved };
}

function parseOperation(row: RawRow, match: HeaderMatch<BinanceStatementColumn>, sheet: string): RowResult<CryptoEvent> {
    const operation: string = normalizeText(textAt(row, match, 'operation'));
    const incomeKind: IncomeKind | undefined = INCOME_OPERATIONS[operation];
    const direction: 'credit' | 'debit' | undefined = TRANSFER_OPERATIONS[operation];
    if (incomeKind === undefined && direction === undefined) {
        return ignore(sheet, row, IGNORE_REASONS.unsupportedMovement, textAt(row, match, 'operation'), null);
    }
    const facts: OperationFacts = {
        tradeDate: utcTradeDateOf(cellAt(row, match, 'date')),
        asset: textOf(cellAt(row, match, 'coin')).toUpperCase(),
        change: englishDecimalOf(cellAt(row, match, 'change'))
    };
    const fault: RejectReason | null = operationFaultOf(facts);
    if (fault !== null || facts.tradeDate === null || facts.change === null) {
        return reject(sheet, row, fault ?? REJECT_REASONS.invalidDate);
    }
    return accept(operationEventOf(row, { ...facts, tradeDate: facts.tradeDate, change: facts.change }, { incomeKind, direction }));
}

export function parseBinanceTrades(table: RawTable, match: HeaderMatch<BinanceTradeColumn>): Collected<CryptoEvent> {
    return collectRows(table, match, parseTrade);
}

export function parseBinanceStatement(table: RawTable, match: HeaderMatch<BinanceStatementColumn>): Collected<CryptoEvent> {
    return collectRows(table, match, parseOperation);
}
