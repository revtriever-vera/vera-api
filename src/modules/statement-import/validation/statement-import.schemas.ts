import { createZodDto, zodToOpenAPI } from 'nestjs-zod';
import { z, ZodTypeAny } from 'zod';
import {
    CsvMapping,
    DATE_FORMATS,
    IMPORT_FORMAT_VALUES,
    IMPORT_STATUS_VALUES,
    MAX_FIELD_BYTES,
    MAX_REJECTION_EXAMPLES,
    NEW_ACCOUNT_KINDS,
    PREVIEW_SAMPLE_SIZE,
    REJECTION_REASON_VALUES
} from '../domain/statement-import.types';

const ACCOUNT_NAME_MAX_LENGTH: number = 60;
const INSTITUTION_MAX_LENGTH: number = 60;
const MAX_COLUMN_INDEX: number = 99;
const MAX_PAGE_SIZE: number = 200;
const DEFAULT_PAGE_SIZE: number = 50;
const CONTROL_CHARACTERS: RegExp = /^[^\p{Cc}]*$/u;

const columnIndex = (description: string): z.ZodNumber => z.number().int().min(0).max(MAX_COLUMN_INDEX).describe(description);

const importFormatSchema = z.enum(IMPORT_FORMAT_VALUES);

export const csvMappingSchema = z
    .object({
        delimiter: z.enum([',', ';']).optional().describe('Column delimiter; detected from the first line when omitted'),
        hasHeader: z.boolean().describe('True when the first line is a header and holds no transaction'),
        dateColumn: columnIndex('Zero-based index of the date column'),
        descriptionColumn: columnIndex('Zero-based index of the description column'),
        amountColumn: columnIndex('Zero-based index of the signed amount column; exclusive with debitColumn and creditColumn').optional(),
        debitColumn: columnIndex('Zero-based index of the debit column (becomes negative); sent together with creditColumn').optional(),
        creditColumn: columnIndex('Zero-based index of the credit column (becomes positive); sent together with debitColumn').optional(),
        dateFormat: z.enum(DATE_FORMATS).describe('Format of the date column'),
        decimalSeparator: z
            .enum([',', '.'])
            .describe('Decimal separator of the amounts; the other symbol is removed as thousands separator'),
        invertSign: z.boolean().describe('True when the file shows expenses as positive amounts')
    })
    .strict()
    .superRefine((mapping, context): void => {
        const hasSingle: boolean = mapping.amountColumn !== undefined;
        const hasPair: boolean = mapping.debitColumn !== undefined && mapping.creditColumn !== undefined;
        const hasPartialPair: boolean = (mapping.debitColumn === undefined) !== (mapping.creditColumn === undefined);
        if (hasSingle === hasPair || hasPartialPair) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'send amountColumn or the debitColumn and creditColumn pair, never both nor neither'
            });
        }
    });

const mappingTextSchema = z
    .string()
    .max(MAX_FIELD_BYTES)
    .transform((raw: string, context): CsvMapping => {
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            context.addIssue({ code: z.ZodIssueCode.custom, message: 'mapping must be valid JSON' });
            return z.NEVER;
        }
        const result = csvMappingSchema.safeParse(parsed);
        if (!result.success) {
            for (const issue of result.error.issues) {
                context.addIssue(issue);
            }
            return z.NEVER;
        }
        return result.data;
    })
    .describe(
        'Column mapping of a generic CSV, as JSON text: { hasHeader, dateColumn, descriptionColumn, amountColumn | debitColumn + creditColumn, dateFormat, decimalSeparator, invertSign, delimiter? }'
    );

export const previewBodySchema = z.object({
    format: importFormatSchema.optional().describe('Forces the format instead of the detected one'),
    mapping: mappingTextSchema.optional()
});

export const commitBodySchema = z
    .object({
        format: importFormatSchema.describe('Format of the file; send the one the preview returned'),
        mapping: mappingTextSchema.optional(),
        accountId: z.string().uuid().optional().describe('Existing financial account of the company that receives the transactions'),
        newAccountName: z
            .string()
            .trim()
            .min(1)
            .max(ACCOUNT_NAME_MAX_LENGTH)
            .regex(CONTROL_CHARACTERS)
            .optional()
            .describe('Name of a new account to create; exclusive with accountId'),
        newAccountKind: z.enum(NEW_ACCOUNT_KINDS).optional().describe('Kind of the new account; required with newAccountName'),
        newAccountInstitution: z
            .string()
            .trim()
            .min(1)
            .max(INSTITUTION_MAX_LENGTH)
            .regex(CONTROL_CHARACTERS)
            .optional()
            .describe('Institution of the new account; defaults to the one found in the file')
    })
    .superRefine((body, context): void => {
        const hasExisting: boolean = body.accountId !== undefined;
        const hasNew: boolean = body.newAccountName !== undefined && body.newAccountKind !== undefined;
        const partialNew: boolean = (body.newAccountName === undefined) !== (body.newAccountKind === undefined);
        if (hasExisting === hasNew || partialNew || (hasExisting && body.newAccountInstitution !== undefined)) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'send accountId, or newAccountName with newAccountKind, never both nor neither'
            });
        }
    });

export const importIdParamsSchema = z.object({
    id: z.string().uuid().describe('Import id')
});

export const importListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1).describe('Page number, starting at 1'),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE).describe('Items per page, 1 to 200 (default 50)')
});

const rejectionSchema = z.object({
    line: z.number().int().describe('Line of the file where the row starts, counted from 1'),
    reason: z.enum(REJECTION_REASON_VALUES).describe('Why the row was rejected; the content of the line is never returned')
});

const sampleRowSchema = z.object({
    date: z.string().describe('Transaction date, YYYY-MM-DD'),
    description: z.string().describe('Description of the transaction, up to 200 characters'),
    amountMinor: z.number().int().describe('Signed amount in minor units; negative is an outflow')
});

export const importPreviewSchema = z.object({
    detectedFormat: importFormatSchema.describe('Format detected from the content'),
    format: importFormatSchema.describe('Format used to read the file; the forced one when the request sent `format`'),
    fileName: z.string().describe('Base name of the uploaded file, up to 120 characters'),
    rows: z.number().int().describe('Valid rows; for a generic CSV sent without mapping, the data lines found'),
    rejected: z.number().int().describe('Rows that could not be read'),
    rejections: z.array(rejectionSchema).max(MAX_REJECTION_EXAMPLES).describe('Up to 20 examples of rejected rows'),
    periodStart: z.string().nullable().describe('Oldest transaction date, YYYY-MM-DD'),
    periodEnd: z.string().nullable().describe('Newest transaction date, YYYY-MM-DD'),
    currency: z.string().nullable().describe('Currency declared by the file (OFX only); a CSV takes the currency of the account'),
    sample: z.array(sampleRowSchema).max(PREVIEW_SAMPLE_SIZE).describe('First rows of the file, up to 10'),
    columns: z.array(z.string()).nullable().describe('Generic CSV only: the header cells, or "Coluna 1..n" without header'),
    accountHint: z
        .object({
            institution: z.string().nullable().describe('Institution found in the file'),
            numberLast4: z.string().nullable().describe('Last four digits of the account or card number found in the file')
        })
        .nullable()
        .describe('What the file says about its account; null when it says nothing'),
    suggestedAccountId: z
        .string()
        .uuid()
        .nullable()
        .describe('The only account of the company that matches the hint; null on a tie or no match'),
    alreadyImportedAt: z
        .string()
        .datetime()
        .nullable()
        .describe('When the exact same file was imported before; it only warns, it does not block')
});

export const importViewSchema = z.object({
    id: z.string().uuid().describe('Import id'),
    accountId: z.string().uuid().describe('Financial account that received the rows'),
    accountName: z.string().describe('Name of that account'),
    format: importFormatSchema.describe('Format of the file'),
    fileName: z.string().describe('Base name of the uploaded file'),
    rows: z.number().int().describe('Valid rows of the file'),
    inserted: z.number().int().describe('Rows that became new transactions'),
    duplicates: z.number().int().describe('Rows that were already there, from this file, another file or the bank connection'),
    rejected: z.number().int().describe('Rows that could not be read'),
    periodStart: z.string().nullable().describe('Oldest transaction date, YYYY-MM-DD'),
    periodEnd: z.string().nullable().describe('Newest transaction date, YYYY-MM-DD'),
    status: z.enum(IMPORT_STATUS_VALUES).describe('`undone` imports had their rows removed; `failed` ones were rolled back'),
    createdAt: z.string().datetime().describe('Creation instant, ISO 8601 UTC')
});

export const importCommitSchema = importViewSchema.extend({
    rejections: z.array(rejectionSchema).max(MAX_REJECTION_EXAMPLES).describe('Up to 20 examples of rejected rows')
});

export const importListSchema = z.object({
    data: z.array(importViewSchema).describe('Imports of the page, newest first'),
    pagination: z.object({
        page: z.number().int(),
        pageSize: z.number().int(),
        totalRecords: z.number().int(),
        totalPages: z.number().int()
    })
});

export const importRemovedSchema = z.object({
    removed: z.number().int().describe('Transactions removed from the account; rows absorbed by the bank connection stay')
});

export function multipartBodyOf(schema: ZodTypeAny): Record<string, unknown> {
    const base: Record<string, unknown> = zodToOpenAPI(schema) as Record<string, unknown>;
    const properties: Record<string, unknown> = (base['properties'] ?? {}) as Record<string, unknown>;
    const required: string[] = (base['required'] ?? []) as string[];
    return {
        ...base,
        properties: { file: { type: 'string', format: 'binary', description: 'The statement file, up to 5 MB' }, ...properties },
        required: ['file', ...required]
    };
}

export class PreviewBodyDto extends createZodDto(previewBodySchema) {}
export class CommitBodyDto extends createZodDto(commitBodySchema) {}
export class ImportIdParamsDto extends createZodDto(importIdParamsSchema) {}
export class ImportListQueryDto extends createZodDto(importListQuerySchema) {}
