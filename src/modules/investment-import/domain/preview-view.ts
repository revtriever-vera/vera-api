import { idsWithStatus } from './line-counts';
import { EvaluatedLine, IgnoredLineView, LINE_REASONS, LINE_STATUSES, NoteView, OperationLineView } from './investment-import.types';

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

export function warningsOf(lines: readonly EvaluatedLine[]): NoteView[] {
    const notFound: number = lines.filter((line: EvaluatedLine): boolean => line.reason === LINE_REASONS.assetNotFound).length;
    const blocked: number = idsWithStatus(lines, LINE_STATUSES.blocked).length;
    const check: number = idsWithStatus(lines, LINE_STATUSES.check).length;
    const candidates: readonly NoteView[] = [
        { code: LINE_REASONS.assetNotFound, count: notFound },
        { code: 'blocked_lines', count: blocked },
        { code: LINE_REASONS.positionModeRequired, count: check }
    ];
    return candidates.filter((note: NoteView): boolean => note.count > 0);
}
