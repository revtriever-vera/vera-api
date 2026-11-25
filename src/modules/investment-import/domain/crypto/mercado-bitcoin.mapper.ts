import { mulDecimal } from '../../../../shared/utils/decimal.util';
import { IGNORE_REASONS, IncomeKind, REJECT_REASONS } from '../investment-statement.types';
import { decimalOf, normalizeText, RawRow, RawTable } from '../b3/b3-cells';
import { cellAt, column, ColumnSpec, HeaderMatch, textAt } from '../b3/b3-columns';
import { accept, Collected, collectRows, ignore, nullIfEmpty, reject, RowResult } from '../b3/b3-rows';
import { isPositive, utcTradeDateOf } from './crypto-cells';
import { CryptoAmount, CryptoEvent } from './crypto-events.types';

export type MercadoBitcoinColumn = 'id' | 'date' | 'type' | 'asset' | 'quantity' | 'price' | 'total' | 'fee' | 'feeAsset';

export const MERCADO_BITCOIN_SPEC: ColumnSpec<MercadoBitcoinColumn> = {
    id: column(false, 'ID', 'ID da ordem'),
    date: column(true, 'Data', 'Data (UTC)'),
    type: column(true, 'Tipo'),
    asset: column(true, 'Par', 'Ativo'),
    quantity: column(true, 'Quantidade'),
    price: column(false, 'Preço', 'Preço unitário'),
    total: column(false, 'Total', 'Valor total'),
    fee: column(false, 'Taxa'),
    feeAsset: column(false, 'Moeda da taxa')
};

const FIAT: string = 'BRL';
const PAIR_SEPARATOR: RegExp = /[-/]/;

const TRADE_TYPES: Readonly<Record<string, 'buy' | 'sell'>> = { compra: 'buy', venda: 'sell' };
const TRANSFER_TYPES: Readonly<Record<string, 'credit' | 'debit'>> = { deposito: 'credit', saque: 'debit' };
const INCOME_TYPES: Readonly<Record<string, IncomeKind>> = {
    staking: 'staking',
    rendimento: 'interest',
    recompensa: 'staking',
    airdrop: 'staking'
};

interface Pair {
    readonly base: string;
    readonly quote: string;
}

function pairOf(text: string): Pair | null {
    const [base, quote] = text.toUpperCase().split(PAIR_SEPARATOR);
    return base === undefined || base === '' ? null : { base, quote: quote === undefined || quote === '' ? FIAT : quote };
}

function feeOf(row: RawRow, match: HeaderMatch<MercadoBitcoinColumn>, quote: string): CryptoAmount | null {
    const quantity: string | null = decimalOf(cellAt(row, match, 'fee'));
    if (!isPositive(quantity)) {
        return null;
    }
    const asset: string = textAt(row, match, 'feeAsset').toUpperCase();
    return { asset: asset === '' ? quote : asset, quantity };
}

function totalOf(row: RawRow, match: HeaderMatch<MercadoBitcoinColumn>, quantity: string): string | null {
    const total: string | null = decimalOf(cellAt(row, match, 'total'));
    if (total !== null) {
        return total;
    }
    const price: string | null = decimalOf(cellAt(row, match, 'price'));
    return price === null ? null : mulDecimal(quantity, price);
}

interface Trade {
    readonly row: RawRow;
    readonly match: HeaderMatch<MercadoBitcoinColumn>;
    readonly sheet: string;
    readonly tradeDate: string;
    readonly side: 'buy' | 'sell';
    readonly pair: Pair;
    readonly quantity: string;
}

function parseTrade(trade: Trade): RowResult<CryptoEvent> {
    const { row, match, sheet, pair, quantity } = trade;
    const total: string | null = totalOf(row, match, quantity);
    if (!isPositive(total)) {
        return reject(sheet, row, REJECT_REASONS.invalidAmount);
    }
    const base: CryptoAmount = { asset: pair.base, quantity };
    const quote: CryptoAmount = { asset: pair.quote, quantity: total };
    return accept({
        kind: 'exchange',
        line: row.line,
        tradeDate: trade.tradeDate,
        externalId: nullIfEmpty(textAt(row, match, 'id')),
        sold: trade.side === 'buy' ? quote : base,
        bought: trade.side === 'buy' ? base : quote,
        valuation: null,
        fee: feeOf(row, match, pair.quote)
    });
}

function parseNonTrade(trade: Trade, type: string): RowResult<CryptoEvent> {
    const { row, match, sheet, pair, quantity, tradeDate } = trade;
    const externalId: string | null = nullIfEmpty(textAt(row, match, 'id'));
    const direction: 'credit' | 'debit' | undefined = TRANSFER_TYPES[type];
    const incomeKind: IncomeKind | undefined = INCOME_TYPES[type];
    if (pair.base === FIAT) {
        return ignore(sheet, row, IGNORE_REASONS.unsupportedMovement, type, tradeDate);
    }
    const moved: CryptoAmount = { asset: pair.base, quantity };
    if (direction !== undefined) {
        return accept({ kind: 'transfer', line: row.line, tradeDate, externalId, direction, moved });
    }
    if (incomeKind !== undefined) {
        return accept({ kind: 'income', line: row.line, tradeDate, externalId, incomeKind, received: moved, valuation: null });
    }
    return ignore(sheet, row, IGNORE_REASONS.unsupportedMovement, type, tradeDate);
}

function parseRow(row: RawRow, match: HeaderMatch<MercadoBitcoinColumn>, sheet: string): RowResult<CryptoEvent> {
    const type: string = normalizeText(textAt(row, match, 'type'));
    const tradeDate: string | null = utcTradeDateOf(cellAt(row, match, 'date'));
    const pair: Pair | null = pairOf(textAt(row, match, 'asset'));
    const quantity: string | null = decimalOf(cellAt(row, match, 'quantity'));
    if (tradeDate === null) {
        return reject(sheet, row, REJECT_REASONS.invalidDate);
    }
    if (pair === null) {
        return reject(sheet, row, REJECT_REASONS.missingAsset);
    }
    if (!isPositive(quantity)) {
        return reject(sheet, row, REJECT_REASONS.invalidQuantity);
    }
    const trade: Trade = { row, match, sheet, tradeDate, side: TRADE_TYPES[type] ?? 'buy', pair, quantity };
    return TRADE_TYPES[type] === undefined ? parseNonTrade(trade, type) : parseTrade(trade);
}

export function parseMercadoBitcoin(table: RawTable, match: HeaderMatch<MercadoBitcoinColumn>): Collected<CryptoEvent> {
    return collectRows(table, match, parseRow);
}
