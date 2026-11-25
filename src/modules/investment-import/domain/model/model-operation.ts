import { currencyExponent, DecimalUtil, divDecimal } from '../../../../shared/utils/decimal.util';
import type { Decimal } from '../../../../shared/utils/decimal.util';
import { IGNORE_REASONS, IgnoredLine, NO_COST_EXTRAS, ParsedOperation, REJECT_REASONS, RejectReason } from '../investment-statement.types';
import { ZodError } from 'zod';
import { AnswerOperation } from './model-answer.schema';
import { amountCheckOf, dateCheckOf } from './model-checks';

export const UNSUPPORTED_MARKET: RegExp = /op[cç][aã]o|option|termo|forward|futuro|future|swap|fixed.?income/i;
const FRACTIONAL_SUFFIX: RegExp = /^([A-Z]{4}\d{1,2})F$/;
const FRACTIONAL_MARKET: RegExp = /fracion/i;
const NON_TICKER: RegExp = /[^A-Z0-9.\-^=]/g;
const PRICE_SCALE: number = 8;
const AFFECTS_POSITION: ReadonlySet<string> = new Set(['buy', 'sell', 'split', 'reverse_split', 'bonus']);
const REJECT_BY_FIELD: Readonly<Record<string, RejectReason>> = {
    tradeDate: REJECT_REASONS.invalidDate,
    quantity: REJECT_REASONS.invalidQuantity,
    unitPrice: REJECT_REASONS.invalidPrice,
    grossMinor: REJECT_REASONS.invalidAmount,
    direction: REJECT_REASONS.invalidSide,
    side: REJECT_REASONS.invalidSide,
    kind: REJECT_REASONS.invalidSide,
    ticker: REJECT_REASONS.missingAsset
};

export function rejectReasonOf(error: ZodError): RejectReason {
    return REJECT_BY_FIELD[String(error.issues[0]?.path[0] ?? '')] ?? REJECT_REASONS.invalidAmount;
}

export function tickerFrom(code: string, market: string | null | undefined): string {
    const upper: string = code.toUpperCase().replace(NON_TICKER, '');
    const fractional: RegExpExecArray | null = FRACTIONAL_SUFFIX.exec(upper);
    return FRACTIONAL_MARKET.test(market ?? '') && fractional !== null ? (fractional[1] ?? upper) : upper;
}

function derivedPriceOf(operation: AnswerOperation): string | null {
    if (operation.grossMinor === null || operation.grossMinor === undefined || Number(operation.quantity) === 0) {
        return null;
    }
    const unit: Decimal = DecimalUtil.of(10).pow(currencyExponent(operation.currency));
    return divDecimal(DecimalUtil.of(operation.grossMinor).div(unit).toFixed(), operation.quantity, PRICE_SCALE);
}

function unitPriceOf(operation: AnswerOperation): string | null {
    return operation.unitPrice ?? derivedPriceOf(operation);
}

type OperationBase = Omit<ParsedOperation, 'matchKey' | 'alreadyImported' | 'check' | 'dollar'>;

function externalRefOf(raw: AnswerOperation): string | null {
    const securityId: string = raw.securityId?.trim().toUpperCase() ?? '';
    if (securityId === '') {
        return null;
    }
    return ['model', securityId, raw.tradeDate, raw.kind, raw.quantity, raw.unitPrice ?? '', String(raw.grossMinor ?? '')].join(':');
}

function baseOf(raw: AnswerOperation, page: string, line: number): OperationBase {
    return {
        sheet: page,
        line,
        kind: raw.kind,
        incomeKind: raw.incomeKind ?? null,
        direction: raw.direction,
        tradeDate: raw.tradeDate,
        ticker: tickerFrom(raw.ticker, raw.market),
        productName: raw.productName ?? null,
        institution: raw.institution ?? null,
        market: raw.market ?? null,
        quantity: raw.quantity,
        unitPrice: unitPriceOf(raw),
        grossMinor: raw.grossMinor ?? null,
        currency: raw.currency.toUpperCase(),
        appliedToPosition: AFFECTS_POSITION.has(raw.kind),
        ...NO_COST_EXTRAS,
        externalRef: externalRefOf(raw)
    };
}

export function operationOf(raw: AnswerOperation, page: string, line: number, today: string): ParsedOperation {
    const base: OperationBase = baseOf(raw, page, line);
    const check: string | null = dateCheckOf(raw.tradeDate, today) ?? amountCheckOf(base);
    const matchKey: string = [base.tradeDate, base.ticker, base.kind, base.quantity, base.unitPrice ?? ''].join('|');
    return { ...base, matchKey, alreadyImported: false, ...(check === null ? {} : { check }) };
}

export function ignoredOf(raw: AnswerOperation, page: string, line: number): IgnoredLine {
    return {
        sheet: page,
        line,
        reason: IGNORE_REASONS.unsupportedMarket,
        description: '',
        tradeDate: raw.tradeDate,
        productCode: null
    };
}
