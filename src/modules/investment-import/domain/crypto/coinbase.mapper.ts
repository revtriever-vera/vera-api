import { IGNORE_REASONS, IncomeKind, REJECT_REASONS } from '../investment-statement.types';
import { normalizeText, RawRow, RawTable, textOf } from '../b3/b3-cells';
import { cellAt, column, ColumnSpec, HeaderMatch, textAt } from '../b3/b3-columns';
import { accept, Collected, collectRows, ignore, nullIfEmpty, reject, RowResult } from '../b3/b3-rows';
import { absolute, englishDecimalOf, isPositive, utcTradeDateOf } from './crypto-cells';
import { CryptoAmount, CryptoEvent } from './crypto-events.types';

export type CoinbaseColumn = 'id' | 'date' | 'type' | 'asset' | 'quantity' | 'priceCurrency' | 'subtotal' | 'fees' | 'notes';

export const COINBASE_SPEC: ColumnSpec<CoinbaseColumn> = {
    id: column(false, 'ID'),
    date: column(true, 'Timestamp'),
    type: column(true, 'Transaction Type'),
    asset: column(true, 'Asset'),
    quantity: column(true, 'Quantity Transacted'),
    priceCurrency: column(true, 'Price Currency', 'Spot Price Currency'),
    subtotal: column(false, 'Subtotal'),
    fees: column(false, 'Fees and/or Spread'),
    notes: column(false, 'Notes')
};

const CONVERSION_NOTE: RegExp = /converted\s+([\d.,]+)\s+([a-z0-9]+)\s+to\s+([\d.,]+)\s+([a-z0-9]+)/i;

const SIDES: Readonly<Record<string, 'buy' | 'sell'>> = {
    buy: 'buy',
    'advanced trade buy': 'buy',
    sell: 'sell',
    'advanced trade sell': 'sell'
};
const TRANSFERS: Readonly<Record<string, 'credit' | 'debit'>> = { send: 'debit', receive: 'credit' };
const INCOME_KINDS: Readonly<Record<string, IncomeKind>> = {
    'rewards income': 'staking',
    'staking income': 'staking',
    'learning reward': 'interest',
    'coinbase earn': 'interest'
};

interface Entry {
    readonly row: RawRow;
    readonly match: HeaderMatch<CoinbaseColumn>;
    readonly sheet: string;
    readonly type: string;
    readonly tradeDate: string;
    readonly externalId: string | null;
    readonly moved: CryptoAmount;
}

function fiatOf(entry: Entry, key: 'subtotal' | 'fees'): CryptoAmount | null {
    const quantity: string | null = englishDecimalOf(cellAt(entry.row, entry.match, key));
    const asset: string = textAt(entry.row, entry.match, 'priceCurrency').toUpperCase();
    return quantity === null || !isPositive(absolute(quantity)) || asset === '' ? null : { asset, quantity: absolute(quantity) };
}

function parseSide(entry: Entry, side: 'buy' | 'sell'): RowResult<CryptoEvent> {
    const fiat: CryptoAmount | null = fiatOf(entry, 'subtotal');
    if (fiat === null) {
        return reject(entry.sheet, entry.row, REJECT_REASONS.invalidAmount);
    }
    return accept({
        kind: 'exchange',
        line: entry.row.line,
        tradeDate: entry.tradeDate,
        externalId: entry.externalId,
        sold: side === 'buy' ? fiat : entry.moved,
        bought: side === 'buy' ? entry.moved : fiat,
        valuation: null,
        fee: fiatOf(entry, 'fees')
    });
}

function conversionAmounts(entry: Entry): { sold: CryptoAmount; bought: CryptoAmount } | null {
    const note: RegExpExecArray | null = CONVERSION_NOTE.exec(textAt(entry.row, entry.match, 'notes'));
    const [, soldQuantity, soldAsset, boughtQuantity, boughtAsset] = note ?? [];
    const sold: string | null = englishDecimalOf(soldQuantity ?? null);
    const bought: string | null = englishDecimalOf(boughtQuantity ?? null);
    if (sold === null || bought === null || soldAsset === undefined || boughtAsset === undefined) {
        return null;
    }
    return { sold: { asset: soldAsset.toUpperCase(), quantity: sold }, bought: { asset: boughtAsset.toUpperCase(), quantity: bought } };
}

function parseConversion(entry: Entry): RowResult<CryptoEvent> {
    const amounts: { sold: CryptoAmount; bought: CryptoAmount } | null = conversionAmounts(entry);
    if (amounts === null) {
        return reject(entry.sheet, entry.row, REJECT_REASONS.invalidQuantity);
    }
    return accept({
        kind: 'exchange',
        line: entry.row.line,
        tradeDate: entry.tradeDate,
        externalId: entry.externalId,
        ...amounts,
        valuation: fiatOf(entry, 'subtotal'),
        fee: fiatOf(entry, 'fees')
    });
}

function parseIncome(entry: Entry, incomeKind: IncomeKind): RowResult<CryptoEvent> {
    return accept({
        kind: 'income',
        line: entry.row.line,
        tradeDate: entry.tradeDate,
        externalId: entry.externalId,
        incomeKind,
        received: entry.moved,
        valuation: fiatOf(entry, 'subtotal')
    });
}

function parseTransfer(entry: Entry, direction: 'credit' | 'debit'): RowResult<CryptoEvent> {
    return accept({
        kind: 'transfer',
        line: entry.row.line,
        tradeDate: entry.tradeDate,
        externalId: entry.externalId,
        direction,
        moved: entry.moved
    });
}

function parseEntry(entry: Entry): RowResult<CryptoEvent> {
    const side: 'buy' | 'sell' | undefined = SIDES[entry.type];
    const direction: 'credit' | 'debit' | undefined = TRANSFERS[entry.type];
    const incomeKind: IncomeKind | undefined = INCOME_KINDS[entry.type];
    if (side !== undefined) {
        return parseSide(entry, side);
    }
    if (direction !== undefined) {
        return parseTransfer(entry, direction);
    }
    if (incomeKind !== undefined) {
        return parseIncome(entry, incomeKind);
    }
    return entry.type === 'convert'
        ? parseConversion(entry)
        : ignore(entry.sheet, entry.row, IGNORE_REASONS.unsupportedMovement, entry.type, entry.tradeDate);
}

function parseRow(row: RawRow, match: HeaderMatch<CoinbaseColumn>, sheet: string): RowResult<CryptoEvent> {
    const type: string = normalizeText(textAt(row, match, 'type'));
    const tradeDate: string | null = utcTradeDateOf(cellAt(row, match, 'date'));
    const asset: string = textOf(cellAt(row, match, 'asset')).toUpperCase();
    const quantity: string | null = englishDecimalOf(cellAt(row, match, 'quantity'));
    if (tradeDate === null) {
        return reject(sheet, row, REJECT_REASONS.invalidDate);
    }
    const isConversion: boolean = type === 'convert';
    if (asset === '' && !isConversion) {
        return reject(sheet, row, REJECT_REASONS.missingAsset);
    }
    if (!isConversion && !isPositive(quantity === null ? null : absolute(quantity))) {
        return reject(sheet, row, REJECT_REASONS.invalidQuantity);
    }
    const moved: CryptoAmount = { asset, quantity: absolute(quantity ?? '0') };
    return parseEntry({ row, match, sheet, type, tradeDate, externalId: nullIfEmpty(textAt(row, match, 'id')), moved });
}

export function parseCoinbase(table: RawTable, match: HeaderMatch<CoinbaseColumn>): Collected<CryptoEvent> {
    return collectRows(table, match, parseRow);
}
