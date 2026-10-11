import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { daysBetween, isValidDate } from '../domain/calendar';
import {
    ACCOUNT_KINDS,
    ACCOUNT_NAME_MAX_LENGTH,
    CATEGORY_ORIGINS,
    DEFAULT_PAGE_SIZE,
    DIRECTIONS,
    MAX_PAGE_SIZE,
    MAX_RANGE_DAYS,
    RULE_SCOPES,
    SEARCH_MAX_LENGTH,
    SEARCH_MIN_LENGTH,
    TRANSACTION_SOURCES
} from '../domain/transactions.types';

const CONTROL_CHARACTERS: RegExp = /^[^\p{Cc}]*$/u;
const MONTH_PATTERN: RegExp = /^\d{4}-(0[1-9]|1[0-2])$/;

const dateSchema = z
    .string()
    .refine(isValidDate, { message: 'must be a calendar date in the format YYYY-MM-DD' })
    .describe('Calendar date, YYYY-MM-DD');

export const listQueryBaseSchema = z.object({
    month: z
        .string()
        .regex(MONTH_PATTERN)
        .optional()
        .describe('Calendar month, YYYY-MM. Exclusive with `from` and `to`. Defaults to the current month'),
    from: dateSchema.optional().describe('First day of the range, YYYY-MM-DD. Requires `to`; the range holds at most 400 days'),
    to: dateSchema.optional().describe('Last day of the range, YYYY-MM-DD. Requires `from`'),
    accountId: z.string().uuid().optional().describe('Only transactions of this financial account'),
    categoryId: z.string().uuid().optional().describe('Only transactions of this category. Not accepted with `uncategorized=true`'),
    uncategorized: z.enum(['true', 'false']).optional().describe('`true` lists only the transactions without category'),
    direction: z.nativeEnum(DIRECTIONS).optional().describe('`in` lists positive amounts, `out` negative amounts'),
    q: z
        .string()
        .trim()
        .min(SEARCH_MIN_LENGTH)
        .max(SEARCH_MAX_LENGTH)
        .regex(CONTROL_CHARACTERS)
        .optional()
        .describe('Text search, 2 to 60 characters, in the normalized description and in the payee name'),
    page: z.coerce.number().int().min(1).default(1).describe('Page number, starting at 1'),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE).describe('Items per page, 1 to 200 (default 50)')
});

type ListQuery = z.infer<typeof listQueryBaseSchema>;

function rangeIssue(query: ListQuery): string | null {
    const hasRange: boolean = query.from !== undefined || query.to !== undefined;
    if (query.month !== undefined && hasRange) {
        return 'month cannot be combined with from and to';
    }
    if ((query.from === undefined) !== (query.to === undefined)) {
        return 'from and to must be sent together';
    }
    if (query.from !== undefined && query.to !== undefined) {
        const span: number = daysBetween(query.from, query.to) + 1;
        return query.to < query.from || span > MAX_RANGE_DAYS ? 'the range must be ordered and hold at most 400 days' : null;
    }
    return null;
}

export const listQuerySchema = listQueryBaseSchema.superRefine((query: ListQuery, context: z.RefinementCtx): void => {
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
});

export const transactionViewSchema = z.object({
    id: z.string().uuid().describe('Transaction id'),
    accountId: z.string().uuid().describe('Financial account id'),
    accountName: z.string().describe('Name of the financial account'),
    date: z.string().describe('Calendar date the bank reports, YYYY-MM-DD; has no time zone'),
    amountMinor: z.number().int().describe('Signed amount in the smallest unit of the currency; negative is money out'),
    currency: z.string().length(3).describe('Currency of the account, ISO 4217'),
    description: z.string().describe('Description as the bank reported it'),
    counterpartyName: z.string().nullable().describe('Payee or payer name when the source reports it; never the document'),
    categoryId: z.string().uuid().nullable().describe('Category of the transaction; null when it has none'),
    categorySource: z.nativeEnum(CATEGORY_ORIGINS).describe('How the category was chosen; `user` is never overwritten by a sync or a rule'),
    ruleId: z.string().uuid().nullable().describe('Rule that categorized the transaction, when categorySource is `rule`'),
    source: z.nativeEnum(TRANSACTION_SOURCES).describe('Where the transaction came from'),
    installment: z
        .object({ number: z.number().int(), total: z.number().int() })
        .nullable()
        .describe('Installment of a purchase paid in parts; null otherwise'),
    isSample: z.boolean().describe('True for example data created during onboarding')
});

export const transactionTotalsSchema = z.object({
    inMinor: z.number().int().describe('Sum of the positive amounts of the whole query, not only of the page'),
    outMinor: z.number().int().describe('Sum of the negative amounts of the whole query (a negative number), not only of the page'),
    count: z.number().int().describe('Number of transactions of the whole query')
});

export const transactionListSchema = z.object({
    data: z.array(transactionViewSchema).describe('Transactions of the page, newest first'),
    pagination: z.object({
        page: z.number().int(),
        pageSize: z.number().int(),
        totalRecords: z.number().int(),
        totalPages: z.number().int()
    }),
    totals: transactionTotalsSchema
});

export const uncategorizedCountSchema = z.object({
    count: z.number().int().describe('Outgoing transactions without category, of all time, example data excluded')
});

export const transactionIdParamsSchema = z.object({
    id: z.string().uuid().describe('Transaction id')
});

export const recategorizeSchema = z
    .object({
        categoryId: z.string().uuid().nullable().describe('Category chosen by the user; null goes back to the automatic categorization'),
        rule: z
            .object({
                scope: z.nativeEnum(RULE_SCOPES).describe('`counterparty` matches the same payee, `description` the same description')
            })
            .strict()
            .nullable()
            .optional()
            .describe('Also create the rule "always to this category" and apply it to the past in the same database transaction')
    })
    .strict()
    .refine((body) => body.rule === null || body.rule === undefined || body.categoryId !== null, {
        message: 'a rule needs a category',
        path: ['rule']
    });

export const ruleViewSchema = z.object({
    id: z.string().uuid().describe('Rule id'),
    matchType: z.enum(['counterparty', 'description', 'contains']).describe('Kind of match of the rule'),
    label: z.string().describe('Text shown to the user, e.g. the payee name; never the document'),
    appliesTo: z.enum(['out', 'in', 'any']).describe('Direction the rule applies to'),
    categoryId: z.string().uuid().describe('Category the rule assigns'),
    createdAt: z.string().datetime().describe('Creation instant, ISO 8601 UTC'),
    updatedAt: z.string().datetime().describe('Last change instant, ISO 8601 UTC')
});

export const recategorizedSchema = z.object({
    transaction: transactionViewSchema,
    rule: ruleViewSchema.nullable().describe('The rule created or updated; null when the request asked for none'),
    recategorized: z.number().int().describe('Other transactions whose category changed because of the rule')
});

export const accountViewSchema = z.object({
    id: z.string().uuid().describe('Financial account id'),
    name: z.string().describe('Name of the account'),
    kind: z.nativeEnum(ACCOUNT_KINDS).describe('Kind of account'),
    institutionName: z.string().nullable().describe('Name of the bank or institution'),
    numberLast4: z
        .string()
        .length(4)
        .nullable()
        .describe('Last four digits of the account or card number; the full number is never stored'),
    currency: z.string().length(3).describe('Currency of the account, ISO 4217'),
    source: z
        .enum(['pluggy', 'file'])
        .describe('`pluggy` accounts come from a bank connection; `file` accounts come from imported statements'),
    transactionCount: z.number().int().describe('Number of transactions of the account'),
    lastTransactionDate: z.string().nullable().describe('Date of the newest transaction, YYYY-MM-DD'),
    isSample: z.boolean().describe('True for example data created during onboarding')
});

export const accountListSchema = z.object({
    accounts: z.array(accountViewSchema).describe('Financial accounts of the company, oldest first')
});

export const renameAccountSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(1)
            .max(ACCOUNT_NAME_MAX_LENGTH)
            .regex(CONTROL_CHARACTERS)
            .describe('New name of the account, 1 to 60 characters without control characters')
    })
    .strict();

export const accountIdParamsSchema = z.object({
    id: z.string().uuid().describe('Financial account id')
});

export class ListQueryDto extends createZodDto(listQuerySchema) {}
export class TransactionIdParamsDto extends createZodDto(transactionIdParamsSchema) {}
export class RecategorizeDto extends createZodDto(recategorizeSchema) {}
export class RenameAccountDto extends createZodDto(renameAccountSchema) {}
export class AccountIdParamsDto extends createZodDto(accountIdParamsSchema) {}
