import { z } from 'zod';
import { BENCHMARK_WINDOWS } from '../../market-benchmarks/services/benchmark.service';
import { FUND_WINDOWS } from '../../market-benchmarks/services/fund-performance.service';
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
        month: month
            .optional()
            .describe(
                'Month, YYYY-MM; omit it unless the person names a month: defaults to the last closed month, and the current month is partial and may have no income'
            ),
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

const MAX_MATURITY_MONTHS: number = 60;
export const DEFAULT_MATURITY_MONTHS: number = 12;

export const maturitiesInputSchema = z
    .object({
        months: z
            .number()
            .int()
            .min(1)
            .max(MAX_MATURITY_MONTHS)
            .optional()
            .describe('How many months ahead to look, from 1 to 60; defaults to 12')
    })
    .strict();

export const benchmarksInputSchema = z
    .object({
        windows: z
            .array(z.enum(BENCHMARK_WINDOWS))
            .min(1)
            .max(BENCHMARK_WINDOWS.length)
            .optional()
            .describe('Windows to return: m1, m3, m6, m12, m24, m36 (months back) and ytd (the year so far); omit for all of them')
    })
    .strict();

const MAX_LOOKUP_QUERY_CHARS: number = 80;
const MAX_KEY_CHARS: number = 64;

export const assetLookupInputSchema = z
    .object({
        query: z.string().trim().min(2).max(MAX_LOOKUP_QUERY_CHARS).describe('Name, ticker or fund name to look up, as the person wrote it')
    })
    .strict();

export const fundPerformanceInputSchema = z
    .object({
        fundId: z.string().min(1).max(MAX_KEY_CHARS).describe('The fund_id returned by asset_lookup, copied as it came'),
        windows: z
            .array(z.enum(FUND_WINDOWS))
            .min(1)
            .max(FUND_WINDOWS.length)
            .optional()
            .describe('Windows to return: m1, m3, m6, m12, m36 (months back); omit for all of them')
    })
    .strict();

export const fixedIncomeBenchmarkInputSchema = z
    .object({
        holdingKey: z
            .string()
            .min(1)
            .max(MAX_KEY_CHARS)
            .optional()
            .describe('The chave of one fixed income security of the portfolio; omit it to list the keys')
    })
    .strict();

export type AssetLookupInput = z.infer<typeof assetLookupInputSchema>;
export type FundPerformanceInput = z.infer<typeof fundPerformanceInputSchema>;
export type FixedIncomeBenchmarkInput = z.infer<typeof fixedIncomeBenchmarkInputSchema>;
export type BenchmarksInput = z.infer<typeof benchmarksInputSchema>;
export type MaturitiesInput = z.infer<typeof maturitiesInputSchema>;
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
