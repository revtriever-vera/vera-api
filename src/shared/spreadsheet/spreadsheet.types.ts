export const EXPORT_FORMATS = {
    xlsx: 'xlsx',
    csv: 'csv'
} as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[keyof typeof EXPORT_FORMATS];

export const EXPORT_CONTENT_TYPES: Readonly<Record<ExportFormat, string>> = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv; charset=utf-8'
};

export interface ExportFile {
    readonly filename: string;
    readonly contentType: string;
    readonly content: Buffer;
    readonly rows: number;
}
