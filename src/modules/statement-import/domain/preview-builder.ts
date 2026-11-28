import { maxCodeUnits, minCodeUnits } from '../../../shared/utils/compare-code-units';
import {
    ImportPreview,
    MAX_REJECTION_EXAMPLES,
    ModelPreview,
    ParsedRow,
    ParsedStatement,
    PREVIEW_SAMPLE_SIZE,
    PreviewTotals,
    SampleRow,
    StoredImportFormat
} from './statement-import.types';

export interface PeriodBounds {
    readonly start: string | null;
    readonly end: string | null;
}

export function periodOf(rows: readonly ParsedRow[]): PeriodBounds {
    const first: ParsedRow | undefined = rows[0];
    if (first === undefined) {
        return { start: null, end: null };
    }
    const bounds: { start: string; end: string } = { start: first.date, end: first.date };
    for (const row of rows) {
        bounds.start = minCodeUnits(row.date, bounds.start);
        bounds.end = maxCodeUnits(row.date, bounds.end);
    }
    return bounds;
}

export function sampleOf(rows: readonly ParsedRow[]): SampleRow[] {
    return rows
        .slice(0, PREVIEW_SAMPLE_SIZE)
        .map((row: ParsedRow): SampleRow => ({ date: row.date, description: row.description, amountMinor: row.amountMinor }));
}

export function totalsOf(rows: readonly ParsedRow[]): PreviewTotals {
    return rows.reduce(
        (totals: PreviewTotals, row: ParsedRow): PreviewTotals =>
            row.amountMinor > 0
                ? { ...totals, inflowMinor: totals.inflowMinor + row.amountMinor }
                : { ...totals, outflowMinor: totals.outflowMinor - row.amountMinor },
        { inflowMinor: 0, outflowMinor: 0 }
    );
}

export interface PreviewContext {
    readonly detectedFormat: StoredImportFormat;
    readonly fileName: string;
    readonly suggestedAccountId: string | null;
    readonly alreadyImportedAt: string | null;
    readonly model: ModelPreview | null;
}

export function buildPreview(statement: ParsedStatement, context: PreviewContext): ImportPreview {
    const period: PeriodBounds = periodOf(statement.rows);
    return {
        detectedFormat: context.detectedFormat,
        format: statement.format,
        fileName: context.fileName,
        rows: statement.pendingMappingRecords ?? statement.rows.length,
        rejected: statement.rejections.length,
        rejections: statement.rejections.slice(0, MAX_REJECTION_EXAMPLES),
        periodStart: period.start,
        periodEnd: period.end,
        currency: statement.currency,
        sample: sampleOf(statement.rows),
        columns: statement.columns,
        accountHint: statement.accountHint,
        suggestedAccountId: context.suggestedAccountId,
        alreadyImportedAt: context.alreadyImportedAt,
        totals: totalsOf(statement.rows),
        model: context.model
    };
}

export function exceedsYears(start: string, end: string, years: number): boolean {
    const limit: Date = new Date(`${start}T00:00:00Z`);
    limit.setUTCFullYear(limit.getUTCFullYear() + years);
    return new Date(`${end}T00:00:00Z`).getTime() > limit.getTime();
}
