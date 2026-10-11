import { ExportTransaction, TransactionFilter } from '../../transactions/services/transaction-reader.service';

export type { ExportTransaction, TransactionFilter };

export type CategoryOriginKey = ExportTransaction['categorySource'];
export type TransactionSourceKey = ExportTransaction['source'];
export type DirectionKey = NonNullable<TransactionFilter['direction']>;

export const MAX_EXPORT_ROWS: number = 50_000;
export const MAX_RANGE_DAYS: number = 400;

export interface TransactionExportRow {
    readonly date: string;
    readonly description: string;
    readonly counterparty: string;
    readonly amountMinor: number;
    readonly currency: string;
    readonly category: string;
    readonly categoryOrigin: string;
    readonly account: string;
    readonly institution: string;
    readonly source: string;
}

export interface ExportPeriod {
    readonly month?: string;
    readonly from?: string;
    readonly to?: string;
}

export interface ExportQueryPayload extends ExportPeriod {
    readonly accountId?: string;
    readonly categoryId?: string;
    readonly uncategorized?: 'true' | 'false';
    readonly direction?: DirectionKey;
    readonly q?: string;
}
