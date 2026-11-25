import { toMinor } from '../../../../shared/utils/decimal.util';
import { ParsedFixedIncome, ParsedFixedIncomePrices, ParsedFixedIncomeValues, REJECT_REASONS } from '../investment-statement.types';
import { dateOf, decimalOf, RawRow, RawTable } from './b3-cells';
import { cellAt, column, ColumnSpec, HeaderMatch, textAt } from './b3-columns';
import { accept, collectRows, Collected, nullIfEmpty, reject, RowResult } from './b3-rows';

export type FixedIncomeColumn =
    | 'product'
    | 'institution'
    | 'issuer'
    | 'code'
    | 'indexer'
    | 'regime'
    | 'issueDate'
    | 'maturity'
    | 'quantity'
    | 'available'
    | 'unavailable'
    | 'reason'
    | 'priceMtm'
    | 'valueMtm'
    | 'priceCurve'
    | 'valueCurve'
    | 'priceClosing'
    | 'valueClosing';

export const FIXED_INCOME_SPEC: ColumnSpec<FixedIncomeColumn> = {
    product: column(true, 'Produto'),
    institution: column(false, 'Instituição'),
    issuer: column(true, 'Emissor'),
    code: column(false, 'Código'),
    indexer: column(true, 'Indexador'),
    regime: column(false, 'Tipo de regime'),
    issueDate: column(true, 'Data de Emissão'),
    maturity: column(true, 'Vencimento'),
    quantity: column(true, 'Quantidade'),
    available: column(false, 'Quantidade Disponível'),
    unavailable: column(false, 'Quantidade Indisponível'),
    reason: column(false, 'Motivo'),
    priceMtm: column(false, 'Preço Atualizado MTM'),
    valueMtm: column(false, 'Valor Atualizado MTM'),
    priceCurve: column(false, 'Preço Atualizado CURVA'),
    valueCurve: column(false, 'Valor Atualizado CURVA'),
    priceClosing: column(false, 'Preço Atualizado FECHAMENTO'),
    valueClosing: column(false, 'Valor Atualizado FECHAMENTO')
};

function minorAt(row: RawRow, match: HeaderMatch<FixedIncomeColumn>, key: FixedIncomeColumn): number | null {
    const value: string | null = decimalOf(cellAt(row, match, key));
    return value === null ? null : toMinor(value, 'BRL');
}

function priceAt(row: RawRow, match: HeaderMatch<FixedIncomeColumn>, key: FixedIncomeColumn): string | null {
    return decimalOf(cellAt(row, match, key));
}

function upperOrNull(text: string): string | null {
    return text === '' ? null : text.toUpperCase();
}

function pricesOf(row: RawRow, match: HeaderMatch<FixedIncomeColumn>): ParsedFixedIncomePrices {
    return {
        mtm: priceAt(row, match, 'priceMtm'),
        curve: priceAt(row, match, 'priceCurve'),
        closing: priceAt(row, match, 'priceClosing')
    };
}

function valuesOf(row: RawRow, match: HeaderMatch<FixedIncomeColumn>): ParsedFixedIncomeValues {
    return {
        mtmMinor: minorAt(row, match, 'valueMtm'),
        curveMinor: minorAt(row, match, 'valueCurve'),
        closingMinor: minorAt(row, match, 'valueClosing')
    };
}

function entryOf(row: RawRow, match: HeaderMatch<FixedIncomeColumn>, sheet: string, quantity: string): ParsedFixedIncome {
    return {
        sheet,
        line: row.line,
        code: upperOrNull(textAt(row, match, 'code')),
        product: textAt(row, match, 'product'),
        issuer: nullIfEmpty(textAt(row, match, 'issuer')),
        institution: nullIfEmpty(textAt(row, match, 'institution')),
        indexer: upperOrNull(textAt(row, match, 'indexer')),
        regime: nullIfEmpty(textAt(row, match, 'regime')),
        issueDate: dateOf(cellAt(row, match, 'issueDate')),
        maturityDate: dateOf(cellAt(row, match, 'maturity')),
        quantity,
        availableQuantity: decimalOf(cellAt(row, match, 'available')),
        unavailableQuantity: decimalOf(cellAt(row, match, 'unavailable')),
        restrictionReason: nullIfEmpty(textAt(row, match, 'reason')),
        unitPrices: pricesOf(row, match),
        values: valuesOf(row, match)
    };
}

function parseEntry(row: RawRow, match: HeaderMatch<FixedIncomeColumn>, sheet: string): RowResult<ParsedFixedIncome> {
    const quantity: string | null = decimalOf(cellAt(row, match, 'quantity'));
    if (quantity === null || Number(quantity) < 0) {
        return reject(sheet, row, REJECT_REASONS.invalidQuantity);
    }
    if (textAt(row, match, 'product') === '') {
        return reject(sheet, row, REJECT_REASONS.missingAsset);
    }
    return accept(entryOf(row, match, sheet, quantity));
}

export function parseFixedIncome(table: RawTable, match: HeaderMatch<FixedIncomeColumn>): Collected<ParsedFixedIncome> {
    return collectRows(table, match, parseEntry);
}
