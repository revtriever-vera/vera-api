import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CUT_STATUSES, MAX_GOAL_BPS } from '../domain/spending-cuts.types';

export const cutsQuerySchema = z.object({
    month: z
        .string()
        .optional()
        .describe('Calendar month analysed, YYYY-MM, from 2000-01 to the current month. Defaults to the last closed month'),
    goalBps: z.coerce
        .number()
        .int()
        .min(0)
        .max(MAX_GOAL_BPS)
        .optional()
        .describe('Simulated savings goal in basis points (2000 = 20%), 0 to 9000. Replaces the saved goal in this response only')
});

const suggestionSchema = z.object({
    categoryId: z.string().uuid(),
    systemKey: z.string().nullable(),
    name: z.string().nullable(),
    icon: z.string(),
    spentMinor: z.number().int(),
    averageMinor: z.number().int().nullable(),
    excessMinor: z.number().int(),
    cutMinor: z.number().int(),
    limitMinor: z.number().int()
});

const objectivesSchema = z.object({
    monthlyNeededMinor: z.number().int().describe('Sum of the monthly amount of the goals not yet done (`GET /goals` totals), BRL cents'),
    behindCount: z.number().int().describe('Goals `behind` or `overdue`'),
    asGoalBps: z
        .number()
        .int()
        .nullable()
        .describe('`monthlyNeededMinor` as basis points of the income of `month`, rounded up and capped at 9000; null when the income is 0')
});

export const cutsResponseSchema = z.object({
    month: z.string(),
    limitMonth: z.string(),
    isPartial: z.boolean(),
    status: z.nativeEnum(CUT_STATUSES),
    goal: z.object({ bps: z.number().int(), minor: z.number().int(), simulated: z.boolean() }),
    incomeMinor: z.number().int(),
    savedMinor: z.number().int(),
    savingsRateBps: z.number().int().nullable(),
    gapMinor: z.number().int(),
    surplusMinor: z.number().int(),
    totalCutMinor: z.number().int(),
    flexibleTotalMinor: z.number().int(),
    excessTotalMinor: z.number().int(),
    categoriesWithCut: z.number().int(),
    uncategorizedMinor: z.number().int(),
    averageMonths: z.number().int(),
    suggestions: z.array(suggestionSchema),
    objectives: objectivesSchema
});

export class CutsQueryDto extends createZodDto(cutsQuerySchema) {}
