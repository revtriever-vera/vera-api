import { mulDecimal, toMinor } from '../../../../shared/utils/decimal.util';
import {
    NO_COST_EXTRAS,
    IGNORE_REASONS,
    IncomeKind,
    OperationDirection,
    OperationKind,
    ParsedOperation,
    REJECT_REASONS
} from '../investment-statement.types';
import { dateOf, decimalOf, normalizeText, RawRow, RawTable } from './b3-cells';
import { cellAt, column, ColumnSpec, HeaderMatch, textAt } from './b3-columns';
import { accept, collectRows, Collected, ignore, nullIfEmpty, productCodeOf, reject, RowResult } from './b3-rows';
import { matchKeyOf } from './b3-negotiation.parser';

export type MovementColumn = 'direction' | 'date' | 'movement' | 'product' | 'institution' | 'quantity' | 'price' | 'value';

export const MOVEMENT_SPEC: ColumnSpec<MovementColumn> = {
    direction: column(true, 'Entrada/Saída'),
    date: column(true, 'Data'),
    movement: column(true, 'Movimentação'),
    product: column(true, 'Produto'),
    institution: column(false, 'Instituição'),
    quantity: column(true, 'Quantidade'),
    price: column(false, 'Preço unitário'),
    value: column(false, 'Valor da Operação')
};

interface MovementRule {
    readonly kind: OperationKind;
    readonly incomeKind: IncomeKind | null;
    readonly appliedToPosition: boolean;
}

const SETTLEMENT: string = 'transferencia liquidacao';

const RULES: Readonly<Record<string, MovementRule>> = {
    desdobro: { kind: 'split', incomeKind: null, appliedToPosition: true },
    grupamento: { kind: 'reverse_split', incomeKind: null, appliedToPosition: true },
    'bonificacao em ativos': { kind: 'bonus', incomeKind: null, appliedToPosition: true },
    dividendo: { kind: 'income', incomeKind: 'dividend', appliedToPosition: false },
    'juros sobre capital proprio': { kind: 'income', incomeKind: 'jcp', appliedToPosition: false },
    rendimento: { kind: 'income', incomeKind: 'fii_income', appliedToPosition: false },
    transferencia: { kind: 'transfer', incomeKind: null, appliedToPosition: false }
};

const DIRECTIONS: Readonly<Record<string, OperationDirection>> = { credito: 'credit', debito: 'debit' };

interface MovementParts {
    readonly row: RawRow;
    readonly match: HeaderMatch<MovementColumn>;
    readonly sheet: string;
    readonly rule: MovementRule;
    readonly tradeDate: string;
    readonly ticker: string;
    readonly direction: OperationDirection;
}

interface Amounts {
    readonly quantity: string | null;
    readonly unitPrice: string | null;
    readonly grossMinor: number | null;
}

function amountsOf(parts: MovementParts): Amounts {
    const quantity: string | null = decimalOf(cellAt(parts.row, parts.match, 'quantity'));
    const unitPrice: string | null = decimalOf(cellAt(parts.row, parts.match, 'price'));
    const value: string | null = decimalOf(cellAt(parts.row, parts.match, 'value'));
    const derived: string | null = quantity !== null && unitPrice !== null ? mulDecimal(quantity, unitPrice) : null;
    const gross: string | null = value ?? derived;
    return { quantity, unitPrice, grossMinor: gross === null ? null : toMinor(gross, 'BRL') };
}

function operationOf(parts: MovementParts, quantity: string, amounts: Amounts): ParsedOperation {
    const operation: Omit<ParsedOperation, 'matchKey' | 'alreadyImported'> = {
        sheet: parts.sheet,
        line: parts.row.line,
        kind: parts.rule.kind,
        incomeKind: parts.rule.incomeKind,
        direction: parts.direction,
        tradeDate: parts.tradeDate,
        ticker: parts.ticker,
        productName: nullIfEmpty(textAt(parts.row, parts.match, 'product')),
        institution: nullIfEmpty(textAt(parts.row, parts.match, 'institution')),
        market: null,
        quantity,
        unitPrice: amounts.unitPrice,
        grossMinor: amounts.grossMinor,
        currency: 'BRL',
        appliedToPosition: parts.rule.appliedToPosition,
        ...NO_COST_EXTRAS
    };
    return { ...operation, matchKey: matchKeyOf(operation), alreadyImported: false };
}

function buildMovement(parts: MovementParts): RowResult<ParsedOperation> {
    const amounts: Amounts = amountsOf(parts);
    if (amounts.quantity === null || Number(amounts.quantity) <= 0) {
        return reject(parts.sheet, parts.row, REJECT_REASONS.invalidQuantity);
    }
    if (parts.rule.kind === 'income' && amounts.grossMinor === null) {
        return reject(parts.sheet, parts.row, REJECT_REASONS.invalidAmount);
    }
    return accept(operationOf(parts, amounts.quantity, amounts));
}

function parseMovement(row: RawRow, match: HeaderMatch<MovementColumn>, sheet: string): RowResult<ParsedOperation> {
    const movement: string = normalizeText(textAt(row, match, 'movement'));
    const ticker: string = productCodeOf(textAt(row, match, 'product'));
    const tradeDate: string | null = dateOf(cellAt(row, match, 'date'));
    if (tradeDate === null) {
        return reject(sheet, row, REJECT_REASONS.invalidDate);
    }
    if (movement === SETTLEMENT) {
        return ignore(sheet, row, IGNORE_REASONS.settlement, ticker, tradeDate, nullIfEmpty(ticker));
    }
    const rule: MovementRule | undefined = RULES[movement];
    if (rule === undefined) {
        return ignore(sheet, row, IGNORE_REASONS.unsupportedMovement, textAt(row, match, 'movement'), tradeDate, nullIfEmpty(ticker));
    }
    const direction: OperationDirection | undefined = DIRECTIONS[normalizeText(textAt(row, match, 'direction'))];
    if (direction === undefined || ticker === '') {
        return reject(sheet, row, direction === undefined ? REJECT_REASONS.invalidSide : REJECT_REASONS.missingAsset);
    }
    return buildMovement({ row, match, sheet, rule, tradeDate, ticker, direction });
}

export function parseMovements(table: RawTable, match: HeaderMatch<MovementColumn>): Collected<ParsedOperation> {
    return collectRows(table, match, parseMovement);
}
