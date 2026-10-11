import { ImportFormat, ImportSummary } from './statement-import.types';

export interface ImportRecord {
    readonly id: string;
    readonly accountId: string;
    readonly format: ImportFormat;
    readonly fileName: string;
    readonly rows: number;
    readonly inserted: number;
    readonly duplicates: number;
    readonly rejected: number;
    readonly periodStart: string | null;
    readonly periodEnd: string | null;
    readonly status: ImportSummary['status'];
    readonly createdAt: string;
}

export function toImportSummary(record: ImportRecord, accountName: string): ImportSummary {
    return {
        id: record.id,
        accountId: record.accountId,
        accountName,
        format: record.format,
        fileName: record.fileName,
        rows: record.rows,
        inserted: record.inserted,
        duplicates: record.duplicates,
        rejected: record.rejected,
        periodStart: record.periodStart,
        periodEnd: record.periodEnd,
        status: record.status,
        createdAt: record.createdAt
    };
}
