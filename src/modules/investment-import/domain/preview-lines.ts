import { createHash } from 'node:crypto';
import {
    IgnoredLine,
    PARSED_SOURCES,
    ParsedInvestmentStatement,
    ParsedOperation,
    ParsedSource,
    OperationDirection
} from './investment-statement.types';
import { B3_MARKET, CRYPTO_MARKET, IgnoredLineView, NOTE_CODES, NoteView, StoredLine } from './investment-import.types';

const EVENT_KINDS: ReadonlySet<string> = new Set(['split', 'reverse_split']);

function occurrenceKey(operation: ParsedOperation): string {
    return [operation.matchKey, operation.direction, operation.kind].join('|');
}

function referenceKeyOf(operation: ParsedOperation): string {
    if (operation.externalRef === null) {
        return occurrenceKey(operation);
    }
    return createHash('sha256').update(operation.externalRef).digest('hex');
}

function marketOf(source: ParsedSource): string {
    return source === PARSED_SOURCES.cryptoCsv ? CRYPTO_MARKET : B3_MARKET;
}

function directionOf(operation: ParsedOperation): OperationDirection {
    return EVENT_KINDS.has(operation.kind) ? operation.direction : 'credit';
}

function lineOf(statement: ParsedInvestmentStatement, operation: ParsedOperation, index: number, reference: string): StoredLine {
    return {
        lineId: `L${String(index + 1)}`,
        lineNumber: index + 1,
        kind: operation.kind,
        incomeKind: operation.incomeKind,
        direction: directionOf(operation),
        tradeDate: operation.tradeDate,
        ticker: operation.ticker,
        quantity: operation.quantity,
        unitPrice: operation.unitPrice,
        grossMinor: operation.grossMinor,
        feesMinor: operation.feesMinor,
        currency: operation.currency,
        market: marketOf(statement.source),
        sourceRef: `${statement.source}:${reference}`,
        check: operation.check ?? null
    };
}

export function storedLinesOf(statement: ParsedInvestmentStatement): StoredLine[] {
    const seen: Map<string, number> = new Map();
    return statement.operations.map((operation: ParsedOperation, index: number): StoredLine => {
        const key: string = referenceKeyOf(operation);
        const occurrence: number = (seen.get(key) ?? 0) + 1;
        seen.set(key, occurrence);
        return lineOf(statement, operation, index, `${key}:${String(occurrence)}`);
    });
}

export function ignoredViewsOf(statement: ParsedInvestmentStatement): IgnoredLineView[] {
    return statement.ignored.map((line: IgnoredLine, index: number): IgnoredLineView => ({
        lineId: `I${String(index + 1)}`,
        status: 'ignored',
        reason: line.reason,
        tradeDate: line.tradeDate
    }));
}

export function notesOf(statement: ParsedInvestmentStatement): NoteView[] {
    const notes: NoteView[] = [];
    const candidates: readonly NoteView[] = [
        { code: NOTE_CODES.positionReportNotApplied, count: statement.positionAdjustments.length },
        { code: NOTE_CODES.fixedIncomePending, count: statement.fixedIncome.length },
        { code: NOTE_CODES.rowsRejected, count: statement.rejected.length },
        { code: NOTE_CODES.rowsIgnored, count: statement.ignored.length },
        ...statement.notes
    ];
    for (const candidate of candidates) {
        if (candidate.count > 0) {
            notes.push(candidate);
        }
    }
    return notes;
}
