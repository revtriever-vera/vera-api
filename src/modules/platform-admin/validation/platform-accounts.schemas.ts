import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const MAX_PAGE_SIZE: number = 100;
const DEFAULT_PAGE_SIZE: number = 25;
const MAX_SEARCH: number = 100;
export const MIN_REASON_LENGTH: number = 5;
export const MAX_REASON_LENGTH: number = 300;

export const ACCESS_LAYERS = { summary: 'summary', data: 'data' } as const;
export type AccessLayer = (typeof ACCESS_LAYERS)[keyof typeof ACCESS_LAYERS];

const planSchema = z
    .enum(['free', 'premium'])
    .describe('`premium` while a Premium contract line is open (a trial counts), otherwise `free`');

export const overviewSchema = z.object({
    accounts: z.object({
        total: z.number().int().describe('Customer accounts alive; the platform company is not counted'),
        createdLast30Days: z.number().int().describe('Accounts created in the last 30 days')
    }),
    plans: z.object({
        free: z.number().int().describe('Accounts without an open Premium line'),
        premium: z.number().int().describe('Accounts with an open Premium line, trials included'),
        trials: z.number().int().describe('Accounts whose open Premium line is a trial')
    })
});

export type OverviewView = z.infer<typeof overviewSchema>;

export const accountsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1).describe('Page number, starting at 1'),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE).describe('Accounts per page'),
    search: z.string().trim().max(MAX_SEARCH).optional().describe('Part of the account name')
});

export class AccountsQueryDto extends createZodDto(accountsQuerySchema) {}

export const accountItemSchema = z.object({
    id: z.string().uuid().describe('Account id'),
    name: z.string().describe('Account name'),
    createdAt: z.string().datetime().describe('When the account was created'),
    plan: planSchema,
    planSource: z
        .string()
        .nullable()
        .describe('Source of the open Premium line (`subscription`, `trial`, `card_trial`, `manual`); null on Free'),
    trialEndsAt: z.string().datetime().nullable().describe('End of the trial, when the open line is one')
});

export type AccountItemView = z.infer<typeof accountItemSchema>;

export const accountListSchema = z.object({
    items: z.array(accountItemSchema).describe('Accounts, newest first. Metadata only: no customer data is opened here'),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int().describe('Accounts matching the search')
});

export type AccountListView = z.infer<typeof accountListSchema>;

export const accountIdParamsSchema = z.object({
    id: z.string().uuid().describe('Account id')
});

export class AccountIdParamsDto extends createZodDto(accountIdParamsSchema) {}

export const accessRequestSchema = z.object({
    reason: z
        .string()
        .trim()
        .min(MIN_REASON_LENGTH)
        .max(MAX_REASON_LENGTH)
        .describe('Why the operator opens this account. Recorded in the audit trail and shown to the account owner'),
    layers: z
        .array(z.enum([ACCESS_LAYERS.summary, ACCESS_LAYERS.data]))
        .min(1)
        .max(2)
        .describe('`summary` for plan, subscription, offer, quota and people; `data` for the account data (read only)')
});

export class AccessRequestDto extends createZodDto(accessRequestSchema) {}

const memberSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string(),
    role: z.string(),
    joinedAt: z.string().datetime()
});

export const accountSummarySchema = z.object({
    account: accountItemSchema,
    locale: z.string(),
    timezone: z.string(),
    people: z.array(memberSchema).describe('People of the account'),
    billing: z.unknown().describe('Subscriptions and invoices, without any card data'),
    offer: z.unknown().describe('Signup link offer the account redeemed; null when none'),
    usage: z.unknown().describe('Paid usage per period and feature')
});

export type AccountSummaryView = z.infer<typeof accountSummarySchema>;

export const accessResponseSchema = z.object({
    accountId: z.string().uuid(),
    summary: accountSummarySchema.optional().describe('Present when the `summary` layer was asked'),
    data: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
            'Present when the `data` layer was asked: one entry per area. Keys, credentials, tokens and WhatsApp conversations never appear'
        )
});

export type AccessResponseView = z.infer<typeof accessResponseSchema>;

export const supportAccessItemSchema = z.object({
    id: z.string().uuid(),
    at: z.string().datetime().describe('When the account was opened'),
    operatorName: z.string().nullable().describe('Name of the operator; null when that person no longer exists'),
    reason: z.string().describe('Reason the operator gave'),
    layers: z.array(z.string()).describe('Which layers were opened')
});

export const supportAccessListSchema = z.object({
    items: z.array(supportAccessItemSchema).describe('Most recent first')
});

export type SupportAccessListView = z.infer<typeof supportAccessListSchema>;
