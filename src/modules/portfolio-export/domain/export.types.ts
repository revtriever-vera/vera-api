import { AppLocale } from '../../../shared/i18n/locale';

export const EXPORT_FORMATS = {
    xlsx: 'xlsx',
    csv: 'csv'
} as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[keyof typeof EXPORT_FORMATS];

export interface ExportRow {
    readonly symbol: string;
    readonly name: string;
    readonly className: string;
    readonly quantity: string | null;
    readonly quantityDecimals: number | null;
    readonly valueMinor: number;
    readonly valueSourceLabel: string;
}

export interface ExportHoldingInput {
    readonly symbol: string;
    readonly name: string;
    readonly classId: string | null;
    readonly quantity: string | null;
    readonly quantityDecimals: number | null;
    readonly valueMinor: number;
    readonly valueSource: string;
}

export interface ExportClassInput {
    readonly classId: string;
    readonly displayName: string;
}

export interface ExportSnapshotInput {
    readonly baseCurrency: string;
    readonly holdings: readonly ExportHoldingInput[];
    readonly classes: readonly ExportClassInput[];
}

export interface ExportTable {
    readonly locale: AppLocale;
    readonly baseCurrency: string;
    readonly rows: readonly ExportRow[];
}

export interface ExportFile {
    readonly filename: string;
    readonly contentType: string;
    readonly content: Buffer;
    readonly rows: number;
}
