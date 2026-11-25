import { EvaluatedLine, LINE_STATUSES, LineStatus } from './investment-import.types';

export function countByStatus(lines: readonly EvaluatedLine[]): Map<LineStatus, number> {
    const counts: Map<LineStatus, number> = new Map(
        Object.values(LINE_STATUSES).map((status: LineStatus): [LineStatus, number] => [status, 0])
    );
    for (const line of lines) {
        counts.set(line.status, (counts.get(line.status) ?? 0) + 1);
    }
    return counts;
}

export function idsWithStatus(lines: readonly EvaluatedLine[], status: LineStatus): string[] {
    return lines.filter((line: EvaluatedLine): boolean => line.status === status).map((line: EvaluatedLine): string => line.lineId);
}
