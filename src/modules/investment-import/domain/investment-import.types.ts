import { Insertable, Selectable } from 'kysely';
import { InvestmentImportPreviews } from '../../../core/database/generated/database.types';
import type { TitleIssuerView } from '../../fixed-income/services/fixed-income-title-importer.service';
import { FixedIncomeOutcome, StoredFixedIncome } from './fixed-income/fixed-income-import.types';
import { IncomeKind, OperationDirection, OperationKind } from './investment-statement.types';

export type InvestmentImportPreview = Selectable<InvestmentImportPreviews>;
export type NewInvestmentImportPreview = Insertable<InvestmentImportPreviews>;

export const MAX_FILE_BYTES: number = 10 * 1024 * 1024;
export const MAX_MULTIPART_FIELDS: number = 4;
export const MAX_FIELD_BYTES: number = 256;
export const PREVIEW_TTL_SECONDS: number = 30 * 60;
export const PREVIEWS_PER_HOUR: number = 60;
export const IMPORTS_PER_HOUR: number = 30;
export const ONE_HOUR_SECONDS: number = 3600;
export const MAX_REPORTED_LINE_IDS: number = 50;
export const MAX_LINES_PER_IMPORT: number = 5000;
export const PURGE_BATCH: number = 500;
export const B3_MARKET = 'B3' as const;

export const LINE_STATUSES = { ok: 'ok', check: 'check', blocked: 'blocked', duplicate: 'duplicate', ignored: 'ignored' } as const;
export type LineStatus = (typeof LINE_STATUSES)[keyof typeof LINE_STATUSES];

export const LINE_REASONS = {
    assetNotFound: 'asset_not_found',
    assetNotAvailable: 'asset_not_available',
    sellExceedsPosition: 'sell_exceeds_position',
    eventFactor: 'event_factor',
    invalidQuantity: 'invalid_quantity',
    unsupportedDirection: 'unsupported_direction',
    positionModeRequired: 'position_mode_required',
    duplicate: 'duplicate',
    skipped: 'skipped'
} as const;

export const POSITION_MODES = { add: 'add', historyOnly: 'history_only' } as const;
export type PositionMode = (typeof POSITION_MODES)[keyof typeof POSITION_MODES];

export const NOTE_CODES = {
    positionReportNotApplied: 'position_report_not_applied',
    fixedIncomePending: 'fixed_income_pending',
    rowsRejected: 'rows_rejected',
    rowsIgnored: 'rows_ignored'
} as const;

export const COMMIT_OUTCOMES = { previewed: 'previewed', committed: 'committed', undone: 'undone', failed: 'failed' } as const;
export type CommitOutcome = (typeof COMMIT_OUTCOMES)[keyof typeof COMMIT_OUTCOMES];

export interface StoredLine {
    readonly lineId: string;
    readonly lineNumber: number;
    readonly kind: OperationKind;
    readonly incomeKind: IncomeKind | null;
    readonly direction: OperationDirection;
    readonly tradeDate: string;
    readonly ticker: string;
    readonly quantity: string;
    readonly unitPrice: string | null;
    readonly grossMinor: number | null;
    readonly currency: string;
    readonly sourceRef: string;
}

export interface PreviewPayload {
    readonly lines: readonly StoredLine[];
    readonly fixedIncome: readonly StoredFixedIncome[];
}

export interface LineEdit {
    readonly lineId: string;
    readonly assetId?: string;
    readonly quantity?: string;
    readonly unitPrice?: string;
    readonly tradeDate?: string;
    readonly feesMinor?: number;
    readonly skip?: boolean;
    readonly positionMode?: PositionMode;
}

export interface EditedLine {
    readonly line: StoredLine;
    readonly assetId: string | null;
    readonly feesMinor: number;
    readonly skip: boolean;
    readonly repriced: boolean;
    readonly positionMode: PositionMode | null;
}

export interface BalanceView {
    readonly quantity: string;
    readonly averagePrice: string | null;
}

export interface EffectLine {
    readonly assetId: string;
    readonly ticker: string;
    readonly name: string;
    readonly existingPosition: boolean;
    readonly before: BalanceView | null;
    readonly after: BalanceView | null;
}

export interface EvaluatedLine {
    readonly lineId: string;
    readonly status: LineStatus;
    readonly reason: string | null;
    readonly kind: OperationKind;
    readonly incomeKind: IncomeKind | null;
    readonly direction: OperationDirection;
    readonly tradeDate: string;
    readonly ticker: string;
    readonly assetId: string | null;
    readonly quantity: string;
    readonly unitPrice: string | null;
    readonly grossMinor: number | null;
    readonly feesMinor: number;
    readonly currency: string;
    readonly positionMode: PositionMode | null;
}

export interface IgnoredLineView {
    readonly lineId: string;
    readonly status: 'ignored';
    readonly reason: string;
    readonly tradeDate: string | null;
}

export interface NoteView {
    readonly code: string;
    readonly count: number;
}

export interface UploadedReport {
    readonly buffer: Buffer;
    readonly originalname: string;
    readonly size: number;
}

export interface OperationLineView {
    readonly lineId: string;
    readonly status: LineStatus;
    readonly reason: string | null;
    readonly kind: OperationKind | null;
    readonly incomeKind: IncomeKind | null;
    readonly direction: OperationDirection | null;
    readonly tradeDate: string | null;
    readonly ticker: string | null;
    readonly assetId: string | null;
    readonly quantity: string | null;
    readonly unitPrice: string | null;
    readonly grossMinor: number | null;
    readonly feesMinor: number | null;
    readonly currency: string | null;
    readonly positionMode: PositionMode | null;
}

export type FixedIncomeLineView = StoredFixedIncome & { readonly issuer: TitleIssuerView | null };

export interface PreviewView {
    readonly previewId: string;
    readonly source: string;
    readonly notes: readonly NoteView[];
    readonly operations: readonly OperationLineView[];
    readonly effect: readonly EffectLine[];
    readonly fixedIncome: readonly FixedIncomeLineView[];
    readonly warnings: readonly NoteView[];
    readonly alreadyImportedAt: string | null;
    readonly expiresAt: string;
}

export interface CommitView {
    readonly importId: string;
    readonly applied: number;
    readonly skipped: number;
    readonly positions: readonly EffectLine[];
    readonly fixedIncome: readonly FixedIncomeOutcome[];
}

export interface ImportRecordView {
    readonly id: string;
    readonly source: string;
    readonly fileName: string;
    readonly status: string;
    readonly operations: number;
    readonly createdAt: string;
}
