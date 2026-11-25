import { divDecimal, mulDecimal, toMinor } from '../../../../shared/utils/decimal.util';
import {
    IGNORE_REASONS,
    NO_COST_EXTRAS,
    OperationKind,
    ParsedOperation,
    REJECT_REASONS,
    RejectReason
} from '../investment-statement.types';
import { dateOf, decimalOf, normalizeText, RawTable } from './b3-cells';
import { cellAt, column, ColumnSpec, HeaderMatch, textAt } from './b3-columns';
import { accept, collectRows, Collected, ignore, nullIfEmpty, reject, RowResult } from './b3-rows';
import type { RawRow } from './b3-cells';

export type NegotiationColumn = 'date' | 'side' | 'market' | 'institution' | 'ticker' | 'quantity' | 'price' | 'value';

export const NEGOTIATION_SPEC: ColumnSpec<NegotiationColumn> = {
    date: column(true, 'Data do Negócio', 'Data do Negocio'),
    side: column(true, 'Tipo de Movimentação'),
    market: column(false, 'Mercado'),
    institution: column(false, 'Instituição'),
    ticker: column(true, 'Código de Negociação'),
    quantity: column(true, 'Quantidade'),
    price: column(true, 'Preço', 'Preço (R$)'),
    value: column(false, 'Valor', 'Valor (R$)')
};

const SIDES: Readonly<Record<string, OperationKind>> = { compra: 'buy', venda: 'sell' };
const FRACTIONAL_SUFFIX: RegExp = /^([A-Z]{4}\d{1,2})F$/;
const SUPPORTED_MARKETS: readonly string[] = ['vista', 'fracionario'];

export function matchKeyOf(operation: Pick<ParsedOperation, 'tradeDate' | 'ticker' | 'kind' | 'quantity' | 'unitPrice'>): string {
    return [operation.tradeDate, operation.ticker, operation.kind, operation.quantity, operation.unitPrice ?? ''].join('|');
}

function tickerOf(raw: string, market: string): string {
    const upper: string = raw.toUpperCase();
    const fractional: RegExpExecArray | null = FRACTIONAL_SUFFIX.exec(upper);
    return market.includes('fracionario') && fractional !== null ? (fractional[1] ?? upper) : upper;
}

function priceOf(row: RawRow, match: HeaderMatch<NegotiationColumn>, quantity: string): string | null {
    const price: string | null = decimalOf(cellAt(row, match, 'price'));
    if (price !== null) {
        return price;
    }
    const value: string | null = decimalOf(cellAt(row, match, 'value'));
    return value === null ? null : divDecimal(value, quantity);
}

interface TradeFields {
    readonly market: string;
    readonly tradeDate: string | null;
    readonly kind: OperationKind | undefined;
    readonly ticker: string;
    readonly quantity: string | null;
}

function fieldsOf(row: RawRow, match: HeaderMatch<NegotiationColumn>): TradeFields {
    const market: string = normalizeText(textAt(row, match, 'market'));
    return {
        market,
        tradeDate: dateOf(cellAt(row, match, 'date')),
        kind: SIDES[normalizeText(textAt(row, match, 'side'))],
        ticker: tickerOf(textAt(row, match, 'ticker'), market),
        quantity: decimalOf(cellAt(row, match, 'quantity'))
    };
}

function faultOf(fields: TradeFields): RejectReason | null {
    if (fields.tradeDate === null) {
        return REJECT_REASONS.invalidDate;
    }
    if (fields.kind === undefined) {
        return REJECT_REASONS.invalidSide;
    }
    if (fields.ticker === '') {
        return REJECT_REASONS.missingAsset;
    }
    return fields.quantity === null || Number(fields.quantity) <= 0 ? REJECT_REASONS.invalidQuantity : null;
}

function isSupportedMarket(market: string): boolean {
    return market === '' || SUPPORTED_MARKETS.some((supported: string): boolean => market.includes(supported));
}

function parseTrade(row: RawRow, match: HeaderMatch<NegotiationColumn>, sheet: string): RowResult<ParsedOperation> {
    const fields: TradeFields = fieldsOf(row, match);
    const fault: RejectReason | null = faultOf(fields);
    if (fault !== null || fields.tradeDate === null || fields.kind === undefined || fields.quantity === null) {
        return reject(sheet, row, fault ?? REJECT_REASONS.invalidDate);
    }
    if (!isSupportedMarket(fields.market)) {
        return ignore(sheet, row, IGNORE_REASONS.unsupportedMarket, fields.ticker, fields.tradeDate);
    }
    return buildTrade({
        row,
        match,
        sheet,
        market: fields.market,
        tradeDate: fields.tradeDate,
        kind: fields.kind,
        ticker: fields.ticker,
        quantity: fields.quantity
    });
}

interface TradeParts {
    readonly row: RawRow;
    readonly match: HeaderMatch<NegotiationColumn>;
    readonly sheet: string;
    readonly market: string;
    readonly tradeDate: string;
    readonly kind: OperationKind;
    readonly ticker: string;
    readonly quantity: string;
}

function operationOf(parts: TradeParts, unitPrice: string): ParsedOperation {
    const value: string | null = decimalOf(cellAt(parts.row, parts.match, 'value'));
    const operation: Omit<ParsedOperation, 'matchKey' | 'alreadyImported'> = {
        sheet: parts.sheet,
        line: parts.row.line,
        kind: parts.kind,
        incomeKind: null,
        direction: parts.kind === 'buy' ? 'credit' : 'debit',
        tradeDate: parts.tradeDate,
        ticker: parts.ticker,
        productName: null,
        institution: nullIfEmpty(textAt(parts.row, parts.match, 'institution')),
        market: nullIfEmpty(parts.market),
        quantity: parts.quantity,
        unitPrice,
        grossMinor: toMinor(value ?? mulDecimal(parts.quantity, unitPrice), 'BRL'),
        currency: 'BRL',
        appliedToPosition: true,
        ...NO_COST_EXTRAS
    };
    return { ...operation, matchKey: matchKeyOf(operation), alreadyImported: false };
}

function buildTrade(parts: TradeParts): RowResult<ParsedOperation> {
    const unitPrice: string | null = priceOf(parts.row, parts.match, parts.quantity);
    if (unitPrice === null) {
        return reject(parts.sheet, parts.row, REJECT_REASONS.invalidPrice);
    }
    return accept(operationOf(parts, unitPrice));
}

export function parseNegotiation(table: RawTable, match: HeaderMatch<NegotiationColumn>): Collected<ParsedOperation> {
    return collectRows(table, match, parseTrade);
}
