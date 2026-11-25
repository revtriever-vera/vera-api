import { SafeParseReturnType, ZodError } from 'zod';
import { currencyExponent, DecimalUtil, divDecimal } from '../../../../shared/utils/decimal.util';
import type { Decimal } from '../../../../shared/utils/decimal.util';
import { ModelUnreadableError } from '../investment-import.errors';
import { LINE_REASONS } from '../investment-import.types';
import {
    DocumentType,
    IGNORE_REASONS,
    IgnoredLine,
    NO_COST_EXTRAS,
    PARSED_SOURCES,
    ParsedInvestmentStatement,
    ParsedOperation,
    REJECT_REASONS,
    RejectedLine,
    RejectReason
} from '../investment-statement.types';
import { AnswerEnvelope, AnswerOperation, answerEnvelopeSchema, answerOperationSchema } from './model-answer.schema';
import { amountCheckOf, dateCheckOf, totalMatches } from './model-checks';

const FRACTIONAL_SUFFIX: RegExp = /^([A-Z]{4}\d{1,2})F$/;
const UNSUPPORTED_MARKET: RegExp = /op[cç][aã]o|option|termo|forward|futuro|future|swap/i;
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
    kind: REJECT_REASONS.invalidSide,
    ticker: REJECT_REASONS.missingAsset
};

export interface ModelStatementInput {
    readonly labels: readonly string[];
    readonly unreadPages: readonly string[];
    readonly today: string;
}

interface PageReading {
    readonly operations: ParsedOperation[];
    readonly ignored: IgnoredLine[];
    readonly rejected: RejectedLine[];
    readonly documentType: DocumentType;
    readonly currency: string;
    readonly totalMinor: number | null;
}

function jsonOf(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function rejectReasonOf(error: ZodError): RejectReason {
    return REJECT_BY_FIELD[String(error.issues[0]?.path[0] ?? '')] ?? REJECT_REASONS.invalidAmount;
}

function tickerOf(operation: AnswerOperation): string {
    const upper: string = operation.ticker.toUpperCase().replace(NON_TICKER, '');
    const fractional: RegExpExecArray | null = FRACTIONAL_SUFFIX.exec(upper);
    return FRACTIONAL_MARKET.test(operation.market ?? '') && fractional !== null ? (fractional[1] ?? upper) : upper;
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

type OperationBase = Omit<ParsedOperation, 'matchKey' | 'alreadyImported' | 'check'>;

function baseOf(raw: AnswerOperation, page: string, line: number): OperationBase {
    return {
        sheet: page,
        line,
        kind: raw.kind,
        incomeKind: raw.incomeKind ?? null,
        direction: raw.direction,
        tradeDate: raw.tradeDate,
        ticker: tickerOf(raw),
        productName: raw.productName ?? null,
        institution: raw.institution ?? null,
        market: raw.market ?? null,
        quantity: raw.quantity,
        unitPrice: unitPriceOf(raw),
        grossMinor: raw.grossMinor ?? null,
        currency: raw.currency.toUpperCase(),
        appliedToPosition: AFFECTS_POSITION.has(raw.kind),
        ...NO_COST_EXTRAS
    };
}

function operationOf(raw: AnswerOperation, page: string, line: number, today: string): ParsedOperation {
    const base: OperationBase = baseOf(raw, page, line);
    const check: string | null = dateCheckOf(raw.tradeDate, today) ?? amountCheckOf(base);
    const matchKey: string = [base.tradeDate, base.ticker, base.kind, base.quantity, base.unitPrice ?? ''].join('|');
    return { ...base, matchKey, alreadyImported: false, ...(check === null ? {} : { check }) };
}

function ignoredOf(raw: AnswerOperation, page: string, line: number): IgnoredLine {
    return {
        sheet: page,
        line,
        reason: IGNORE_REASONS.unsupportedMarket,
        description: '',
        tradeDate: raw.tradeDate,
        productCode: null
    };
}

function readOperation(item: unknown, reading: PageReading, page: string, line: number, today: string): void {
    const parsed: SafeParseReturnType<unknown, AnswerOperation> = answerOperationSchema.safeParse(item);
    if (!parsed.success) {
        reading.rejected.push({ sheet: page, line, reason: rejectReasonOf(parsed.error) });
        return;
    }
    if (UNSUPPORTED_MARKET.test(parsed.data.market ?? '')) {
        reading.ignored.push(ignoredOf(parsed.data, page, line));
        return;
    }
    reading.operations.push(operationOf(parsed.data, page, line, today));
}

function readPage(text: string, page: string, today: string): PageReading {
    const envelope: SafeParseReturnType<unknown, AnswerEnvelope> = answerEnvelopeSchema.safeParse(jsonOf(text));
    if (!envelope.success) {
        throw new ModelUnreadableError('invalid_response');
    }
    const data: AnswerEnvelope = envelope.data;
    const reading: PageReading = {
        operations: [],
        ignored: [],
        rejected: [],
        documentType: data.documentType,
        currency: data.currency.toUpperCase(),
        totalMinor: data.totalMinor ?? null
    };
    data.operations.forEach((item: unknown, index: number): void => {
        readOperation(item, reading, page, index + 1, today);
    });
    return reading;
}

function flagTotal(operations: readonly ParsedOperation[], totals: readonly (number | null)[]): ParsedOperation[] {
    const known: number[] = totals.filter((total: number | null): total is number => total !== null);
    const sum: number | null = known.length === 0 ? null : known.reduce((left: number, right: number): number => left + right, 0);
    if (totalMatches(operations, sum)) {
        return [...operations];
    }
    return operations.map((operation: ParsedOperation): ParsedOperation => ({
        ...operation,
        check: operation.check ?? LINE_REASONS.totalMismatch
    }));
}

function unreadIgnored(page: string): IgnoredLine {
    return { sheet: page, line: 0, reason: IGNORE_REASONS.pageNotRead, description: '', tradeDate: null, productCode: null };
}

function unreadOf(readings: readonly PageReading[], unreadPages: readonly string[]): IgnoredLine[] {
    return [...readings.flatMap((reading: PageReading): IgnoredLine[] => reading.ignored), ...unreadPages.map(unreadIgnored)];
}

function operationsOf(readings: readonly PageReading[]): ParsedOperation[] {
    return flagTotal(
        readings.flatMap((reading: PageReading): ParsedOperation[] => reading.operations),
        readings.map((reading: PageReading): number | null => reading.totalMinor)
    );
}

export function statementOfModelAnswers(answers: readonly string[], input: ModelStatementInput): ParsedInvestmentStatement {
    const readings: PageReading[] = answers.map((text: string, index: number): PageReading =>
        readPage(text, input.labels[index] ?? '', input.today)
    );
    const first: PageReading | undefined = readings[0];
    if (first === undefined) {
        throw new ModelUnreadableError('invalid_response');
    }
    return {
        source: PARSED_SOURCES.model,
        documentType: first.documentType,
        reportKinds: [],
        currency: first.currency,
        operations: operationsOf(readings),
        positionAdjustments: [],
        fixedIncome: [],
        notes: [],
        ignored: unreadOf(readings, input.unreadPages),
        rejected: readings.flatMap((reading: PageReading): RejectedLine[] => reading.rejected)
    };
}
