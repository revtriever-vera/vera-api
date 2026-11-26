import { COVERAGE_REASONS, CoverageReason, ClassReturn } from './monthly-review.types';
import { monthAfter, monthLabel } from './review-months';

export function coverageMessageOf(reason: CoverageReason | null, month: string): string | null {
    switch (reason) {
        case COVERAGE_REASONS.noOperations:
            return 'A rentabilidade aparece quando as suas operações estiverem importadas.';
        case COVERAGE_REASONS.noPreviousSnapshot:
            return `A rentabilidade aparece a partir de ${monthLabel(monthAfter(month))}.`;
        case COVERAGE_REASONS.classesNotClosing:
        case COVERAGE_REASONS.noBase:
            return 'A rentabilidade só aparece onde as suas operações explicam a variação das quantidades.';
        default:
            return null;
    }
}

export function isCovered(row: ClassReturn): boolean {
    return row.returnPct !== undefined;
}
