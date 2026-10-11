import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { daysBetween, isCalendarDate } from '../domain/export-period';
import { MAX_RANGE_DAYS } from '../domain/transactions-export.types';

const SEARCH_MIN_LENGTH: number = 2;
const SEARCH_MAX_LENGTH: number = 60;
const CONTROL_CHARACTERS: RegExp = /^[^\p{Cc}]*$/u;
const MONTH_PATTERN: RegExp = /^\d{4}-(0[1-9]|1[0-2])$/;

const dateSchema = z
    .string()
    .refine(isCalendarDate, { message: 'must be a calendar date in the format YYYY-MM-DD' })
    .describe('Calendar date, YYYY-MM-DD');

export const transactionsExportBaseSchema = z.object({
    format: z
        .enum(['xlsx', 'csv'])
        .describe('File format: xlsx for a spreadsheet with numeric and date cells, csv for UTF-8 text with BOM'),
    month: z
        .string()
        .regex(MONTH_PATTERN)
        .optional()
        .describe('Calendar month, YYYY-MM. Exclusive with `from` and `to`. Defaults to the current month in the company time zone'),
    from: dateSchema.optional().describe('First day of the range, YYYY-MM-DD. Requires `to`; the range holds at most 400 days'),
    to: dateSchema.optional().describe('Last day of the range, YYYY-MM-DD. Requires `from`'),
    accountId: z.string().uuid().optional().describe('Only transactions of this financial account'),
    categoryId: z.string().uuid().optional().describe('Only transactions of this category. Not accepted with `uncategorized=true`'),
    uncategorized: z.enum(['true', 'false']).optional().describe('`true` exports only the transactions without category'),
    direction: z.enum(['in', 'out']).optional().describe('`in` exports positive amounts, `out` negative amounts'),
    q: z
        .string()
        .trim()
        .min(SEARCH_MIN_LENGTH)
        .max(SEARCH_MAX_LENGTH)
        .regex(CONTROL_CHARACTERS)
        .optional()
        .describe('Text search, 2 to 60 characters, in the normalized description and in the payee name')
});

type ExportQuery = z.infer<typeof transactionsExportBaseSchema>;

function rangeIssue(query: ExportQuery): string | null {
    const hasRange: boolean = query.from !== undefined || query.to !== undefined;
    if (query.month !== undefined && hasRange) {
        return 'month cannot be combined with from and to';
    }
    if ((query.from === undefined) !== (query.to === undefined)) {
        return 'from and to must be sent together';
    }
    if (query.from !== undefined && query.to !== undefined) {
        const span: number = daysBetween(query.from, query.to) + 1;
        return span < 1 || span > MAX_RANGE_DAYS ? 'the range must be ordered and hold at most 400 days' : null;
    }
    return null;
}

export const transactionsExportQuerySchema = transactionsExportBaseSchema.superRefine(
    (query: ExportQuery, context: z.RefinementCtx): void => {
        const issue: string | null = rangeIssue(query);
        if (issue !== null) {
            context.addIssue({ code: z.ZodIssueCode.custom, message: issue, path: ['from'] });
        }
        if (query.categoryId !== undefined && query.uncategorized === 'true') {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'categoryId cannot be combined with uncategorized=true',
                path: ['categoryId']
            });
        }
    }
);

export class TransactionsExportQueryDto extends createZodDto(transactionsExportQuerySchema) {}
