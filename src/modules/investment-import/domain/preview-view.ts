import { idsWithStatus } from './line-counts';
import {
    EvaluatedLine,
    IgnoredLineView,
    LINE_REASONS,
    LINE_STATUSES,
    NOTE_CODES,
    NoteView,
    OperationLineView
} from './investment-import.types';

export function operationViewOf(line: EvaluatedLine): OperationLineView {
    return { ...line };
}

export function ignoredOperationViewOf(line: IgnoredLineView): OperationLineView {
    return {
        lineId: line.lineId,
        status: LINE_STATUSES.ignored,
        reason: line.reason,
        kind: null,
        incomeKind: null,
        direction: null,
        tradeDate: line.tradeDate,
        ticker: null,
        assetId: null,
        quantity: null,
        unitPrice: null,
        grossMinor: null,
        feesMinor: null,
        currency: null,
        positionMode: null
    };
}

function countOf(foreign: ReadonlyMap<string, string>, code: string): number {
    return [...foreign.values()].filter((value: string): boolean => value === code).length;
}

export function warningsOf(lines: readonly EvaluatedLine[], foreign: ReadonlyMap<string, string> = new Map()): NoteView[] {
    const notFound: number = lines.filter((line: EvaluatedLine): boolean => line.reason === LINE_REASONS.assetNotFound).length;
    const blocked: number = idsWithStatus(lines, LINE_STATUSES.blocked).length;
    const choice: number = lines.filter((line: EvaluatedLine): boolean => line.reason === LINE_REASONS.positionModeRequired).length;
    const mismatch: number = countOf(foreign, LINE_REASONS.positionMismatch);
    const unordered: number = countOf(foreign, LINE_REASONS.outOfOrder);
    const named: number = lines.filter((line: EvaluatedLine): boolean => foreign.get(line.lineId) === line.reason).length;
    const check: number = idsWithStatus(lines, LINE_STATUSES.check).length - choice - named;
    const candidates: readonly NoteView[] = [
        { code: LINE_REASONS.positionMismatch, count: mismatch },
        { code: LINE_REASONS.outOfOrder, count: unordered },
        { code: LINE_REASONS.assetNotFound, count: notFound },
        { code: 'blocked_lines', count: blocked },
        { code: LINE_REASONS.positionModeRequired, count: choice },
        { code: NOTE_CODES.linesToCheck, count: check }
    ];
    return candidates.filter((note: NoteView): boolean => note.count > 0);
}
