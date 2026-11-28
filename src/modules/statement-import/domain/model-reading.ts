import { parseJsonObject } from '../../../core/llm/structured-output';
import { ModelAnswer, modelAnswerSchema, modelTransactionSchema } from './model-answer.schema';
import { RowDraft, statementOf } from './parsed-statement';
import { exceedsYears, PeriodBounds, periodOf } from './preview-builder';
import { InvalidFileError, ModelUnreadableError, TooManyRowsError } from './statement-import.errors';
import {
    AccountHint,
    DateFormat,
    INVALID_FILE_REASONS,
    MAX_RANGE_YEARS,
    MAX_VALID_ROWS,
    MODEL_FORMAT,
    MODEL_UNREADABLE_REASONS,
    ModelReading,
    ParsedStatement
} from './statement-import.types';
import { parseDateWith } from './statement-values';

const ISO_DATE_FORMAT: DateFormat = 'yyyy-MM-dd';

function answerOf(text: string): ModelAnswer {
    const parsed: ReturnType<typeof modelAnswerSchema.safeParse> = modelAnswerSchema.safeParse(parseJsonObject(text));
    if (!parsed.success) {
        throw new ModelUnreadableError(MODEL_UNREADABLE_REASONS.invalidResponse);
    }
    return parsed.data;
}

function draftOf(item: unknown, line: number): RowDraft {
    const parsed: ReturnType<typeof modelTransactionSchema.safeParse> = modelTransactionSchema.safeParse(item);
    if (!parsed.success) {
        return { line, date: null, amountMinor: null, description: '' };
    }
    const amount: number = parsed.data.amountMinor;
    return {
        line,
        date: parseDateWith(parsed.data.date, ISO_DATE_FORMAT),
        amountMinor: Number.isSafeInteger(amount) ? amount : null,
        description: parsed.data.description.trim()
    };
}

function hintOf(answers: readonly ModelAnswer[]): AccountHint | null {
    const institution: string | null =
        answers.find((answer: ModelAnswer): boolean => (answer.institution ?? null) !== null)?.institution ?? null;
    const numberLast4: string | null =
        answers.find((answer: ModelAnswer): boolean => (answer.accountLast4 ?? null) !== null)?.accountLast4 ?? null;
    return institution === null && numberLast4 === null ? null : { institution, numberLast4 };
}

function assertLimits(statement: ParsedStatement): void {
    if (statement.rows.length === 0) {
        throw new ModelUnreadableError(MODEL_UNREADABLE_REASONS.noTransactions);
    }
    if (statement.rows.length > MAX_VALID_ROWS) {
        throw new TooManyRowsError(MAX_VALID_ROWS);
    }
    const period: PeriodBounds = periodOf(statement.rows);
    if (period.start !== null && period.end !== null && exceedsYears(period.start, period.end, MAX_RANGE_YEARS)) {
        throw new InvalidFileError(INVALID_FILE_REASONS.dateRangeTooWide);
    }
}

export function readingOfModelAnswers(texts: readonly string[], pagesNotRead: readonly string[]): ModelReading {
    const answers: ModelAnswer[] = texts.map(answerOf);
    const drafts: RowDraft[] = answers
        .flatMap((answer: ModelAnswer): unknown[] => answer.transactions)
        .map((item: unknown, index: number): RowDraft => draftOf(item, index + 1));
    const statement: ParsedStatement = statementOf(MODEL_FORMAT, drafts);
    assertLimits(statement);
    return {
        rows: statement.rows,
        rejections: statement.rejections,
        currency: answers.find((answer: ModelAnswer): boolean => (answer.currency ?? null) !== null)?.currency ?? null,
        accountHint: hintOf(answers),
        pagesNotRead
    };
}

export function statementOfReading(reading: ModelReading): ParsedStatement {
    return {
        format: MODEL_FORMAT,
        rows: reading.rows,
        rejections: reading.rejections,
        currency: reading.currency,
        accountHint: reading.accountHint,
        columns: null,
        pendingMappingRecords: null
    };
}
