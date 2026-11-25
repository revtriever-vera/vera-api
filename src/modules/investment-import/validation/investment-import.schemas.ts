import { createZodDto, zodToOpenAPI } from 'nestjs-zod';
import { z, ZodTypeAny } from 'zod';
import { LINE_STATUSES, MAX_FILE_BYTES, POSITION_MODES } from '../domain/investment-import.types';

const MAX_PAGE_SIZE: number = 200;
const DEFAULT_PAGE_SIZE: number = 50;
const MAX_EDITS: number = 5000;
const MAX_FEES_MINOR: number = 9_000_000_000_000_000;
const QUANTITY_PATTERN: RegExp = /^\d{1,18}(\.\d{1,10})?$/;
const PRICE_PATTERN: RegExp = /^\d{1,16}(\.\d{1,8})?$/;
const DATE_PATTERN: RegExp = /^\d{4}-\d{2}-\d{2}$/;
const LINE_STATUS_VALUES = Object.values(LINE_STATUSES) as [string, ...string[]];
const POSITION_MODE_VALUES = [POSITION_MODES.add, POSITION_MODES.historyOnly] as const;
const SOURCE_VALUES = ['b3', 'crypto_csv', 'model'] as const;
const KIND_VALUES = ['buy', 'sell', 'split', 'reverse_split', 'bonus', 'income', 'transfer'] as const;
const INCOME_VALUES = ['dividend', 'jcp', 'fii_income', 'interest', 'staking'] as const;

export const previewBodySchema = z.object({
    holderUserId: z.string().uuid().optional().describe('Member of the company that holds the investments; omit for the whole account')
});

const lineEditSchema = z
    .object({
        lineId: z.string().min(1).max(20).describe('Line id returned by the preview'),
        assetId: z.string().uuid().optional().describe('Catalog asset to use instead of the one matched by ticker'),
        quantity: z.string().regex(QUANTITY_PATTERN).optional().describe('Corrected quantity, decimal string'),
        unitPrice: z.string().regex(PRICE_PATTERN).optional().describe('Corrected unit price, decimal string'),
        tradeDate: z.string().regex(DATE_PATTERN).optional().describe('Corrected trade date, YYYY-MM-DD'),
        feesMinor: z.number().int().min(0).max(MAX_FEES_MINOR).optional().describe('Fees in minor units of the line currency'),
        skip: z.boolean().optional().describe('True to leave the line out of the import'),
        positionMode: z
            .enum(POSITION_MODE_VALUES)
            .optional()
            .describe('`add` applies the line to the position; `history_only` only records it in the history')
    })
    .strict();

export const commitBodySchema = z.object({
    previewId: z.string().uuid().describe('Preview id returned by POST /investment-imports/preview'),
    edits: z.array(lineEditSchema).max(MAX_EDITS).default([]).describe('Corrections by line; lines without edit are imported as read')
});

export const importIdParamsSchema = z.object({ id: z.string().uuid().describe('Import id') });

export const importListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1).describe('Page number, starting at 1'),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE).describe('Items per page, 1 to 200 (default 50)')
});

const balanceSchema = z
    .object({
        quantity: z.string().describe('Quantity held, decimal string'),
        averagePrice: z.string().nullable().describe('Average cost per unit, null when unknown')
    })
    .nullable();

const lineViewSchema = z.object({
    lineId: z.string().describe('Stable id of the line inside the preview'),
    status: z.enum(LINE_STATUS_VALUES).describe('ok, check (needs a choice), blocked (fix or skip), duplicate or ignored'),
    reason: z.string().nullable().describe('Why the line is not ok; null when ok'),
    kind: z.enum(KIND_VALUES).nullable().describe('Operation kind; null for ignored report rows'),
    incomeKind: z.enum(INCOME_VALUES).nullable().describe('Income kind, only for income'),
    direction: z.enum(['credit', 'debit']).nullable().describe('Direction of the movement in the report'),
    tradeDate: z.string().nullable().describe('Trade date, YYYY-MM-DD'),
    ticker: z.string().nullable().describe('Ticker as read from the report'),
    assetId: z.string().uuid().nullable().describe('Catalog asset matched; null when not found'),
    quantity: z.string().nullable().describe('Quantity as read, decimal string'),
    unitPrice: z.string().nullable().describe('Unit price as read, decimal string'),
    grossMinor: z.number().int().nullable().describe('Gross amount in minor units of the currency'),
    feesMinor: z.number().int().nullable().describe('Fees in minor units of the currency'),
    currency: z.string().nullable().describe('ISO 4217 currency'),
    positionMode: z.enum(POSITION_MODE_VALUES).nullable().describe('Chosen or default position mode; null when the person must choose')
});

const effectSchema = z.object({
    assetId: z.string().uuid().describe('Catalog asset'),
    ticker: z.string().describe('Catalog symbol of the asset'),
    name: z.string().describe('Catalog name of the asset'),
    existingPosition: z.boolean().describe('True when the portfolio already holds this asset for the holder'),
    before: balanceSchema.describe('Position before the import; null when none'),
    after: balanceSchema.describe('Position after the import; null when the position would be closed')
});

const noteSchema = z.object({
    code: z.string().describe('Stable code of the note'),
    count: z.number().int().describe('How many rows the note refers to')
});

export const importPreviewSchema = z.object({
    previewId: z.string().uuid().describe('Id to send to POST /investment-imports; valid until expiresAt'),
    source: z.enum(SOURCE_VALUES).describe('Kind of report read'),
    notes: z.array(noteSchema).describe('Informational notes about what was left out of the import'),
    operations: z.array(lineViewSchema).describe('Every line of the report with its status and reason'),
    effect: z.array(effectSchema).describe('Position of each asset before and after the import'),
    fixedIncome: z.array(z.unknown()).describe('Fixed income titles found; filled by the fixed income reader'),
    warnings: z.array(noteSchema).describe('Attention points: unmatched assets, lines to choose, blocked lines'),
    alreadyImportedAt: z.string().datetime().nullable().describe('When the exact same file was imported before'),
    expiresAt: z.string().datetime().describe('When the preview stops being valid, 30 minutes after creation')
});

export const importCommitSchema = z.object({
    importId: z.string().uuid().describe('Id of the import, used to undo it'),
    applied: z.number().int().describe('Operations recorded'),
    skipped: z.number().int().describe('Lines left out: skipped by the person, duplicates and ignored rows'),
    positions: z.array(effectSchema).describe('Position of each asset after the import')
});

const importRecordSchema = z.object({
    id: z.string().uuid().describe('Import id'),
    source: z.enum(SOURCE_VALUES).describe('Kind of report read'),
    fileName: z.string().describe('Base name of the file that was uploaded'),
    status: z.enum(['completed', 'undone']).describe('`undone` imports had their operations reverted'),
    operations: z.number().int().describe('Operations the import recorded'),
    createdAt: z.string().datetime().describe('Creation instant, ISO 8601 UTC')
});

export const importListSchema = z.object({
    data: z.array(importRecordSchema).describe('Imports of the page, newest first'),
    pagination: z.object({
        page: z.number().int(),
        pageSize: z.number().int(),
        totalRecords: z.number().int(),
        totalPages: z.number().int()
    })
});

export const importUndoneSchema = z.object({ undone: z.boolean().describe('True when the positions were restored') });

export function multipartBodyOf(schema: ZodTypeAny): Record<string, unknown> {
    const base: Record<string, unknown> = zodToOpenAPI(schema) as Record<string, unknown>;
    const properties: Record<string, unknown> = (base['properties'] ?? {}) as Record<string, unknown>;
    const required: string[] = (base['required'] ?? []) as string[];
    const limit: number = MAX_FILE_BYTES / (1024 * 1024);
    return {
        ...base,
        properties: {
            file: { type: 'string', format: 'binary', description: `The report (xlsx or csv), up to ${String(limit)} MB` },
            ...properties
        },
        required: ['file', ...required]
    };
}

export class PreviewBodyDto extends createZodDto(previewBodySchema) {}
export class CommitBodyDto extends createZodDto(commitBodySchema) {}
export class ImportIdParamsDto extends createZodDto(importIdParamsSchema) {}
export class ImportListQueryDto extends createZodDto(importListQuerySchema) {}
