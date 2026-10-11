export const IMPORT_FORMATS = {
    ofx: 'ofx',
    csvNubankCard: 'csv_nubank_card',
    csvNubankAccount: 'csv_nubank_account',
    csvGeneric: 'csv_generic'
} as const;

export type ImportFormat = (typeof IMPORT_FORMATS)[keyof typeof IMPORT_FORMATS];

export const IMPORT_FORMAT_VALUES: readonly [ImportFormat, ...ImportFormat[]] = [
    IMPORT_FORMATS.ofx,
    IMPORT_FORMATS.csvNubankCard,
    IMPORT_FORMATS.csvNubankAccount,
    IMPORT_FORMATS.csvGeneric
];

export const NEW_ACCOUNT_KINDS: readonly ['checking', 'savings', 'credit_card', 'other'] = ['checking', 'savings', 'credit_card', 'other'];

export type NewAccountKind = (typeof NEW_ACCOUNT_KINDS)[number];

export const IMPORT_STATUS_VALUES: readonly ['processing', 'completed', 'undone', 'failed'] = [
    'processing',
    'completed',
    'undone',
    'failed'
];

export const REJECTION_REASONS = {
    invalidDate: 'invalid_date',
    invalidAmount: 'invalid_amount',
    zeroAmount: 'zero_amount',
    emptyDescription: 'empty_description'
} as const;

export type RejectionReason = (typeof REJECTION_REASONS)[keyof typeof REJECTION_REASONS];

export const REJECTION_REASON_VALUES: readonly [RejectionReason, ...RejectionReason[]] = [
    REJECTION_REASONS.invalidDate,
    REJECTION_REASONS.invalidAmount,
    REJECTION_REASONS.zeroAmount,
    REJECTION_REASONS.emptyDescription
];

export const INVALID_FILE_REASONS = {
    noValidRows: 'no_valid_rows',
    malformed: 'malformed',
    headerMismatch: 'header_mismatch',
    unterminatedQuote: 'unterminated_quote',
    dateRangeTooWide: 'date_range_too_wide'
} as const;

export type InvalidFileReason = (typeof INVALID_FILE_REASONS)[keyof typeof INVALID_FILE_REASONS];

export const DATE_FORMATS: readonly ['dd/MM/yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy', 'dd/MM/yy'] = [
    'dd/MM/yyyy',
    'yyyy-MM-dd',
    'MM/dd/yyyy',
    'dd/MM/yy'
];

export type DateFormat = (typeof DATE_FORMATS)[number];

export const MAX_FILE_BYTES: number = 5 * 1024 * 1024;
export const MAX_MULTIPART_FIELDS: number = 10;
export const MAX_FIELD_BYTES: number = 16 * 1024;
export const MAX_VALID_ROWS: number = 10_000;
export const MAX_RAW_RECORDS: number = 50_000;
export const MAX_RANGE_YEARS: number = 5;
export const MAX_REJECTION_EXAMPLES: number = 20;
export const PREVIEW_SAMPLE_SIZE: number = 10;
export const MAX_CELL_LENGTH: number = 500;
export const DESCRIPTION_MAX_LENGTH: number = 200;
export const FILE_NAME_MAX_LENGTH: number = 120;
export const EXTERNAL_ID_MAX_LENGTH: number = 150;
export const DEFAULT_CURRENCY: string = 'BRL';
export const PREVIEWS_PER_HOUR: number = 60;
export const IMPORTS_PER_HOUR: number = 20;
export const ONE_HOUR_SECONDS: number = 3600;
export const SNIFF_BYTES: number = 2048;

export interface CsvMapping {
    readonly delimiter?: ',' | ';';
    readonly hasHeader: boolean;
    readonly dateColumn: number;
    readonly descriptionColumn: number;
    readonly amountColumn?: number;
    readonly debitColumn?: number;
    readonly creditColumn?: number;
    readonly dateFormat: DateFormat;
    readonly decimalSeparator: ',' | '.';
    readonly invertSign: boolean;
}

export interface Rejection {
    readonly line: number;
    readonly reason: RejectionReason;
}

export interface ParsedRow {
    readonly line: number;
    readonly date: string;
    readonly amountMinor: number;
    readonly description: string;
    readonly externalId: string | null;
}

export interface AccountHint {
    readonly institution: string | null;
    readonly numberLast4: string | null;
}

export interface ParsedStatement {
    readonly format: ImportFormat;
    readonly rows: readonly ParsedRow[];
    readonly rejections: readonly Rejection[];
    readonly currency: string | null;
    readonly accountHint: AccountHint | null;
    readonly columns: readonly string[] | null;
    readonly pendingMappingRecords: number | null;
}

export interface SampleRow {
    readonly date: string;
    readonly description: string;
    readonly amountMinor: number;
}

export interface ImportPreview {
    readonly detectedFormat: ImportFormat;
    readonly format: ImportFormat;
    readonly fileName: string;
    readonly rows: number;
    readonly rejected: number;
    readonly rejections: readonly Rejection[];
    readonly periodStart: string | null;
    readonly periodEnd: string | null;
    readonly currency: string | null;
    readonly sample: readonly SampleRow[];
    readonly columns: readonly string[] | null;
    readonly accountHint: AccountHint | null;
    readonly suggestedAccountId: string | null;
    readonly alreadyImportedAt: string | null;
}

export interface ImportSummary {
    readonly id: string;
    readonly accountId: string;
    readonly accountName: string;
    readonly format: ImportFormat;
    readonly fileName: string;
    readonly rows: number;
    readonly inserted: number;
    readonly duplicates: number;
    readonly rejected: number;
    readonly periodStart: string | null;
    readonly periodEnd: string | null;
    readonly status: 'processing' | 'completed' | 'undone' | 'failed';
    readonly createdAt: string;
}

export interface ImportCommitView extends ImportSummary {
    readonly rejections: readonly Rejection[];
}

export interface UploadedStatement {
    readonly buffer: Buffer;
    readonly originalname: string;
    readonly size: number;
}
