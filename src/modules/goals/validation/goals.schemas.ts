import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { holderQuerySchema } from '../../../shared/holder/holder-filter';
import {
    FULL_SHARE_BPS,
    GOAL_HOLDING_KINDS,
    GOAL_KINDS,
    GOAL_STATUSES,
    MAX_HOLDINGS_PER_GOAL,
    MAX_NAME_LENGTH
} from '../domain/goals.types';

const DATE_PATTERN: RegExp = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
    const parsed: Date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

const minorSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const targetMinorSchema = minorSchema
    .refine((value: number): boolean => value > 0, 'must be positive')
    .describe('Amount to reach, in BRL cents (positive integer)');

export const targetDateSchema = z
    .string()
    .regex(DATE_PATTERN)
    .refine(isCalendarDate, 'not a calendar date')
    .describe('Target date, YYYY-MM-DD, a calendar date without time zone. Must be after today in the company time zone');

export const manualMinorSchema = minorSchema.describe('Money kept outside the portfolio for this goal, in BRL cents (0 or more)');

export const goalNameSchema = z.string().trim().min(1).max(MAX_NAME_LENGTH).describe('Name of the goal, up to 60 characters');

export const holderUserIdSchema = z
    .string()
    .uuid()
    .nullable()
    .describe('Holder of the goal: id of an active person of the account; null is the whole account ("Conta toda")');

export const goalHoldingInputSchema = z
    .object({
        kind: z.nativeEnum(GOAL_HOLDING_KINDS).describe('`position` (asset of the portfolio) or `fixed_income` (fixed income title)'),
        holdingId: z.string().uuid().describe('Id of the position or of the fixed income title'),
        shareBps: z
            .number()
            .int()
            .min(1)
            .max(FULL_SHARE_BPS)
            .describe('Part of the holding that counts for this goal, in basis points (10000 = 100%)')
    })
    .strict();

const holdingsSchema = z
    .array(goalHoldingInputSchema)
    .max(MAX_HOLDINGS_PER_GOAL)
    .refine(
        (items: readonly { kind: string; holdingId: string }[]): boolean =>
            new Set(items.map((item: { kind: string; holdingId: string }): string => `${item.kind}:${item.holdingId}`)).size ===
            items.length,
        'the same holding appears twice'
    )
    .describe('Holdings linked to the goal. The sum of the shares of one holding across all goals is at most 10000 bps');

export const createGoalSchema = z
    .object({
        kind: z.nativeEnum(GOAL_KINDS).describe('Template of the goal'),
        name: goalNameSchema,
        targetMinor: targetMinorSchema,
        targetDate: targetDateSchema,
        holderUserId: holderUserIdSchema.optional(),
        manualMinor: manualMinorSchema.optional(),
        holdings: holdingsSchema
    })
    .strict();

export const updateGoalSchema = z
    .object({
        name: goalNameSchema.optional(),
        targetMinor: targetMinorSchema.optional(),
        targetDate: targetDateSchema.optional(),
        holderUserId: holderUserIdSchema.optional(),
        manualMinor: manualMinorSchema.optional(),
        holdings: holdingsSchema.optional().describe('When present, replaces every link of the goal')
    })
    .strict();

export const goalIdParamsSchema = z.object({ id: z.string().uuid().describe('Goal id') });

export const goalsQuerySchema = z.object({ holder: holderQuerySchema });

const goalHoldingViewSchema = z.object({
    kind: z.nativeEnum(GOAL_HOLDING_KINDS),
    holdingId: z.string().uuid(),
    shareBps: z.number().int().describe('Linked part, in basis points'),
    removed: z.boolean().describe('True when the holding is no longer in the portfolio; it adds nothing to the balance'),
    symbol: z.string().nullable().describe('Symbol of the asset; null for fixed income or a removed holding'),
    name: z.string().nullable().describe('Name of the holding; null when it was removed'),
    valueMinor: z.number().int().nullable().describe('Part of the holding that counts for the goal today, in BRL cents; null when removed')
});

export const goalViewSchema = z.object({
    id: z.string().uuid(),
    kind: z.nativeEnum(GOAL_KINDS),
    name: z.string(),
    targetMinor: z.number().int().describe('Amount to reach, BRL cents'),
    targetDate: z.string().describe('Target date, YYYY-MM-DD'),
    holderUserId: z.string().uuid().nullable().describe('Holder of the goal; null is the whole account'),
    manualMinor: z.number().int().describe('Money outside the portfolio, BRL cents'),
    manualUpdatedAt: z.string().datetime().nullable().describe('When the manual value last changed'),
    balanceMinor: z.number().int().describe('Manual value plus the linked part of each holding, BRL cents'),
    remainingMinor: z.number().int().describe('What is missing to reach the target, never negative'),
    monthlyMinor: z.number().int().describe('Remaining divided by the calendar months left (current month not counted), rounded up'),
    monthsRemaining: z.number().int().describe('Calendar months from the current one to the one of the target date, at least 1'),
    status: z.nativeEnum(GOAL_STATUSES).describe('`done`, `overdue` (date passed), `behind` (below the reference plan) or `on_track`'),
    expectedMinor: z.number().int().describe('Balance the reference plan expects for the current month'),
    planMonthlyMinor: z.number().int().describe('Monthly amount of the reference plan'),
    monthDeltaMinor: z.number().int().nullable().describe('Change since the start of the month; null when the start of month is unknown'),
    removedHoldings: z.number().int().describe('How many linked holdings were removed from the portfolio'),
    holdings: z.array(goalHoldingViewSchema),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
});

export const goalsListSchema = z.object({
    items: z.array(goalViewSchema),
    totals: z.object({
        count: z.number().int(),
        monthlyNeededMinor: z.number().int().describe('Sum of the monthly amount of the goals not yet done, BRL cents'),
        onTrackCount: z.number().int(),
        behindCount: z.number().int().describe('Goals `behind` or `overdue`'),
        doneCount: z.number().int()
    })
});

export type GoalView = z.infer<typeof goalViewSchema>;
export type GoalsList = z.infer<typeof goalsListSchema>;

export class CreateGoalDto extends createZodDto(createGoalSchema) {}
export class UpdateGoalDto extends createZodDto(updateGoalSchema) {}
export class GoalIdParamsDto extends createZodDto(goalIdParamsSchema) {}
export class GoalsQueryDto extends createZodDto(goalsQuerySchema) {}
