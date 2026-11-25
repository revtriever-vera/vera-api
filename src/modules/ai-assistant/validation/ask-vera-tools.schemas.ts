import { z } from 'zod';
import { MONTH_PATTERN, monthIndexOf } from '../domain/ask-tool-output';

const MAX_MONTHS: number = 12;
const MAX_GOAL_BPS: number = 9000;
const MAX_AMOUNT_MINOR: number = 100_000_000_000;

const month = z.string().regex(MONTH_PATTERN);

function spanOk(value: { fromMonth: string; toMonth: string }): boolean {
    const span: number = monthIndexOf(value.toMonth) - monthIndexOf(value.fromMonth);
    return span >= 0 && span < MAX_MONTHS;
}

export const noInputSchema = z.object({}).strict();

export const monthSummaryInputSchema = z
    .object({ month: month.optional().describe('Month, YYYY-MM; defaults to the last closed month') })
    .strict();

export const cutsInputSchema = z
    .object({
        month: month.optional().describe('Month, YYYY-MM; defaults to the last closed month'),
        goalBps: z.number().int().min(0).max(MAX_GOAL_BPS).optional().describe('Savings goal to simulate, in basis points of income')
    })
    .strict();

export const byCategoryInputSchema = z
    .object({
        categoryKey: z.string().min(1).max(64).optional().describe('Category key from list_categories; omit for all categories'),
        fromMonth: month.describe('First month, YYYY-MM'),
        toMonth: month.describe('Last month, YYYY-MM; at most 12 months from the first')
    })
    .strict()
    .refine(spanOk, { message: 'toMonth must not be before fromMonth and the period must have at most 12 months' });

export const contributionInputSchema = z
    .object({ amountMinor: z.number().int().min(1).max(MAX_AMOUNT_MINOR).describe('Amount to contribute, in cents (R$ 5,000 is 500000)') })
    .strict();

export type MonthSummaryInput = z.infer<typeof monthSummaryInputSchema>;
export type CutsInput = z.infer<typeof cutsInputSchema>;
export type ByCategoryInput = z.infer<typeof byCategoryInputSchema>;
export type ContributionInput = z.infer<typeof contributionInputSchema>;

const MAX_HELP_QUERY_CHARS: number = 200;

export const helpSearchInputSchema = z
    .object({
        query: z.string().min(1).max(MAX_HELP_QUERY_CHARS).describe('What the person wants to know about using Vera, in their own words')
    })
    .strict();

export const whereIsInputSchema = z
    .object({ topic: z.string().min(1).max(MAX_HELP_QUERY_CHARS).describe('The subject whose screen the person is looking for') })
    .strict();

export type HelpSearchInput = z.infer<typeof helpSearchInputSchema>;
export type WhereIsInput = z.infer<typeof whereIsInputSchema>;
