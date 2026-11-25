import { ParsedPositionAdjustment, POSITION_GROUPS, PositionGroup, REJECT_REASONS } from '../investment-statement.types';
import { dateOf, decimalOf, normalizeText, RawRow, RawTable } from './b3-cells';
import { cellAt, column, ColumnSpec, HeaderMatch, textAt } from './b3-columns';
import { accept, collectRows, Collected, leadingCodeOf, nullIfEmpty, reject, RowResult } from './b3-rows';

export type PositionColumn =
    | 'product'
    | 'institution'
    | 'ticker'
    | 'companyCnpj'
    | 'fundCnpj'
    | 'isin'
    | 'type'
    | 'indexer'
    | 'maturity'
    | 'quantity'
    | 'available'
    | 'unavailable'
    | 'reason'
    | 'closingPrice';

const BASE_SPEC: ColumnSpec<PositionColumn> = {
    product: column(true, 'Produto'),
    institution: column(false, 'Instituição'),
    ticker: column(false, 'Código de Negociação'),
    companyCnpj: column(false, 'CNPJ da Empresa'),
    fundCnpj: column(false, 'CNPJ do Fundo'),
    isin: column(false, 'Código ISIN / Distribuição', 'Código ISIN'),
    type: column(false, 'Tipo'),
    indexer: column(false, 'Indexador'),
    maturity: column(false, 'Vencimento'),
    quantity: column(true, 'Quantidade'),
    available: column(false, 'Quantidade Disponível'),
    unavailable: column(false, 'Quantidade Indisponível'),
    reason: column(false, 'Motivo'),
    closingPrice: column(false, 'Preço de Fechamento')
};

export const EQUITY_SPEC: ColumnSpec<PositionColumn> = {
    ...BASE_SPEC,
    ticker: column(true, 'Código de Negociação'),
    companyCnpj: column(true, 'CNPJ da Empresa')
};

export const FUND_SPEC: ColumnSpec<PositionColumn> = {
    ...BASE_SPEC,
    fundCnpj: column(true, 'CNPJ do Fundo')
};

export const TREASURY_SPEC: ColumnSpec<PositionColumn> = {
    ...BASE_SPEC,
    isin: column(true, 'Código ISIN / Distribuição', 'Código ISIN'),
    indexer: column(true, 'Indexador'),
    maturity: column(true, 'Vencimento')
};

const SHEET_GROUPS: readonly (readonly [string, PositionGroup])[] = [
    ['bdr', POSITION_GROUPS.bdr],
    ['etf', POSITION_GROUPS.etf],
    ['fundo', POSITION_GROUPS.fund],
    ['tesouro', POSITION_GROUPS.treasury]
];
const DEPOSITARY_RECEIPT: RegExp = /^DR/i;

export function groupOf(sheet: string, defaultGroup: PositionGroup, type: string): PositionGroup {
    const name: string = normalizeText(sheet);
    const byName: readonly [string, PositionGroup] | undefined = SHEET_GROUPS.find((entry: readonly [string, PositionGroup]): boolean =>
        name.includes(entry[0])
    );
    if (byName !== undefined) {
        return byName[1];
    }
    return defaultGroup === POSITION_GROUPS.stock && DEPOSITARY_RECEIPT.test(type) ? POSITION_GROUPS.bdr : defaultGroup;
}

function upperOrNull(text: string): string | null {
    return text === '' ? null : text.toUpperCase();
}

function decimalOrNull(row: RawRow, match: HeaderMatch<PositionColumn>, key: PositionColumn): string | null {
    return decimalOf(cellAt(row, match, key));
}

function adjustmentOf(
    row: RawRow,
    match: HeaderMatch<PositionColumn>,
    sheet: string,
    group: PositionGroup,
    quantity: string
): ParsedPositionAdjustment {
    const product: string = textAt(row, match, 'product');
    const ticker: string | null = group === POSITION_GROUPS.treasury ? null : upperOrNull(textAt(row, match, 'ticker'));
    return {
        sheet,
        line: row.line,
        group,
        ticker: ticker ?? (group === POSITION_GROUPS.treasury ? null : upperOrNull(leadingCodeOf(product))),
        productName: product,
        institution: nullIfEmpty(textAt(row, match, 'institution')),
        cnpj: nullIfEmpty(textAt(row, match, 'companyCnpj') || textAt(row, match, 'fundCnpj')),
        isin: upperOrNull(textAt(row, match, 'isin')),
        maturityDate: dateOf(cellAt(row, match, 'maturity')),
        indexer: upperOrNull(textAt(row, match, 'indexer')),
        quantity,
        availableQuantity: decimalOrNull(row, match, 'available'),
        unavailableQuantity: decimalOrNull(row, match, 'unavailable'),
        restrictionReason: nullIfEmpty(textAt(row, match, 'reason')),
        referencePrice: decimalOrNull(row, match, 'closingPrice')
    };
}

export interface PositionTarget {
    readonly table: RawTable;
    readonly match: HeaderMatch<PositionColumn>;
    readonly defaultGroup: PositionGroup;
}

export function parsePositions(target: PositionTarget): Collected<ParsedPositionAdjustment> {
    return collectRows(
        target.table,
        target.match,
        (row: RawRow, match: HeaderMatch<PositionColumn>, sheet: string): RowResult<ParsedPositionAdjustment> => {
            const quantity: string | null = decimalOrNull(row, match, 'quantity');
            if (quantity === null || Number(quantity) < 0) {
                return reject(sheet, row, REJECT_REASONS.invalidQuantity);
            }
            const group: PositionGroup = groupOf(sheet, target.defaultGroup, textAt(row, match, 'type'));
            const adjustment: ParsedPositionAdjustment = adjustmentOf(row, match, sheet, group, quantity);
            if (adjustment.ticker === null && adjustment.cnpj === null && adjustment.isin === null) {
                return reject(sheet, row, REJECT_REASONS.missingAsset);
            }
            return accept(adjustment);
        }
    );
}
