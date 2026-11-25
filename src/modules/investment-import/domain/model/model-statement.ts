import { SafeParseReturnType } from 'zod';
import { BRL } from '../foreign/foreign-statement';
import { snapshotOperationsOf } from '../foreign/foreign-summary';
import { ModelUnreadableError } from '../investment-import.errors';
import { LINE_REASONS, NOTE_CODES } from '../investment-import.types';
import {
    DOCUMENT_TYPES,
    DocumentType,
    ForeignExtras,
    IGNORE_REASONS,
    IgnoredLine,
    PARSED_SOURCES,
    ParsedInvestmentStatement,
    ParsedOperation,
    RejectedLine,
    StatementNote
} from '../investment-statement.types';
import { readNote, specsOfNote } from './brokerage-note';
import { foreignExtrasOf, mergedForeignOf } from './model-foreign';
import { AnswerEnvelope, AnswerOperation, answerEnvelopeSchema, answerOperationSchema } from './model-answer.schema';
import { totalMatches } from './model-checks';
import { ignoredOf, operationOf, rejectReasonOf, UNSUPPORTED_MARKET } from './model-operation';

const SNAPSHOT_TYPES: ReadonlySet<DocumentType> = new Set([DOCUMENT_TYPES.screenshot, DOCUMENT_TYPES.b3Report]);

export interface ModelStatementInput {
    readonly labels: readonly string[];
    readonly unreadPages: readonly string[];
    readonly today: string;
    readonly tickersBySpec?: ReadonlyMap<string, string>;
}

interface PageReading {
    readonly operations: ParsedOperation[];
    readonly ignored: IgnoredLine[];
    readonly rejected: RejectedLine[];
    readonly documentType: DocumentType;
    readonly currency: string;
    readonly totalMinor: number | null;
    readonly noteOperations: ParsedOperation[];
    readonly foreign: ForeignExtras;
    totalMismatches: number;
    netMismatches: number;
}

function jsonOf(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
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

function readNotes(data: AnswerEnvelope, reading: PageReading, page: string, input: ModelStatementInput): void {
    let line: number = data.operations.length;
    const context: Parameters<typeof readNote>[1] = {
        page,
        today: input.today,
        tickersBySpec: input.tickersBySpec ?? new Map<string, string>(),
        nextLine: (): number => {
            line += 1;
            return line;
        }
    };
    for (const item of data.notes) {
        const note: ReturnType<typeof readNote> = readNote(item, context);
        reading.noteOperations.push(...note.operations);
        reading.ignored.push(...note.ignored);
        reading.rejected.push(...note.rejected);
        reading.totalMismatches += note.totalMismatches;
        reading.netMismatches += note.netMismatches;
    }
}

function readPage(text: string, page: string, input: ModelStatementInput): PageReading {
    const { today } = input;
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
        totalMinor: data.totalMinor ?? null,
        noteOperations: [],
        foreign: foreignExtrasOf(data),
        totalMismatches: 0,
        netMismatches: 0
    };
    data.operations.forEach((item: unknown, index: number): void => {
        readOperation(item, reading, page, index + 1, today);
    });
    readNotes(data, reading, page, input);
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
    return [
        ...flagTotal(
            readings.flatMap((reading: PageReading): ParsedOperation[] => reading.operations),
            readings.map((reading: PageReading): number | null => reading.totalMinor)
        ),
        ...readings.flatMap((reading: PageReading): ParsedOperation[] => reading.noteOperations)
    ];
}

function sumOf(readings: readonly PageReading[], pick: (reading: PageReading) => number): number {
    return readings.reduce((total: number, reading: PageReading): number => total + pick(reading), 0);
}

function notesOf(readings: readonly PageReading[]): StatementNote[] {
    const candidates: readonly StatementNote[] = [
        { code: NOTE_CODES.noteTotalMismatch, count: sumOf(readings, (reading: PageReading): number => reading.totalMismatches) },
        { code: NOTE_CODES.noteNetMismatch, count: sumOf(readings, (reading: PageReading): number => reading.netMismatches) }
    ];
    return candidates.filter((note: StatementNote): boolean => note.count > 0);
}

function snapshotOf(first: PageReading, foreign: ForeignExtras, operations: readonly ParsedOperation[], today: string): ParsedOperation[] {
    const isSnapshot: boolean = SNAPSHOT_TYPES.has(first.documentType) && first.currency === BRL && operations.length === 0;
    return isSnapshot ? snapshotOperationsOf(foreign.positions, first.currency, today) : [];
}

export function specsOfModelAnswers(answers: readonly string[]): string[] {
    const specs: Set<string> = new Set();
    for (const text of answers) {
        const envelope: SafeParseReturnType<unknown, AnswerEnvelope> = answerEnvelopeSchema.safeParse(jsonOf(text));
        if (envelope.success) {
            envelope.data.notes.flatMap(specsOfNote).forEach((spec: string): void => void specs.add(spec));
        }
    }
    return [...specs];
}

export function statementOfModelAnswers(answers: readonly string[], input: ModelStatementInput): ParsedInvestmentStatement {
    const readings: PageReading[] = answers.map((text: string, index: number): PageReading =>
        readPage(text, input.labels[index] ?? '', input)
    );
    const first: PageReading | undefined = readings[0];
    if (first === undefined) {
        throw new ModelUnreadableError('invalid_response');
    }
    const foreign: ForeignExtras = mergedForeignOf(readings.map((reading: PageReading): ForeignExtras => reading.foreign));
    const operations: ParsedOperation[] = operationsOf(readings);
    return {
        foreign,
        source: PARSED_SOURCES.model,
        documentType: first.documentType,
        reportKinds: [],
        currency: first.currency,
        operations: [...operations, ...snapshotOf(first, foreign, operations, input.today)],
        positionAdjustments: [],
        fixedIncome: [],
        notes: notesOf(readings),
        ignored: unreadOf(readings, input.unreadPages),
        rejected: readings.flatMap((reading: PageReading): RejectedLine[] => reading.rejected)
    };
}
