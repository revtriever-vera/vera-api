import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { INCOME_MODES, MAX_DECLARED_INCOME_MINOR, MAX_SAVINGS_GOAL_BPS } from '../domain/spending-summary.types';

const savingsGoalBpsSchema = z
    .number()
    .int()
    .min(0)
    .max(MAX_SAVINGS_GOAL_BPS)
    .describe('Savings goal as a share of the income, in basis points (2000 = 20%), 0 to 9000');

const incomeModeSchema = z
    .nativeEnum(INCOME_MODES)
    .describe('`transactions` takes the income from the `income` transactions; `declared` uses `declaredIncomeMinor`');

const declaredIncomeSchema = z
    .number()
    .int()
    .min(0)
    .max(MAX_DECLARED_INCOME_MINOR)
    .nullable()
    .describe('Monthly income declared by the user, in cents. Required and greater than zero when the mode is `declared`');

export const spendingSettingsSchema = z.object({
    savingsGoalBps: savingsGoalBpsSchema,
    incomeMode: incomeModeSchema,
    declaredIncomeMinor: declaredIncomeSchema
});

export const updateSpendingSettingsSchema = z
    .object({
        savingsGoalBps: savingsGoalBpsSchema.optional(),
        incomeMode: incomeModeSchema.optional(),
        declaredIncomeMinor: declaredIncomeSchema.optional()
    })
    .strict();

export const summaryQuerySchema = z.object({
    month: z.string().optional().describe('Calendar month, YYYY-MM, from 2000-01 to the current month. Defaults to the last closed month')
});

const categoryRowSchema = z.object({
    categoryId: z.string().uuid(),
    systemKey: z.string().nullable(),
    name: z.string().nullable(),
    icon: z.string(),
    flexibility: z.enum(['fixed', 'flexible']).nullable(),
    spentMinor: z.number().int(),
    averageMinor: z.number().int().nullable(),
    deltaBps: z.number().int().nullable(),
    isNew: z.boolean(),
    transactionCount: z.number().int()
});

export const monthlySummarySchema = z.object({
    month: z.string(),
    isPartial: z.boolean(),
    hasData: z.boolean(),
    currency: z.literal('BRL'),
    previousMonth: z.string().nullable(),
    nextMonth: z.string().nullable(),
    availableMonths: z.array(z.string()),
    income: z.object({
        minor: z.number().int(),
        mode: incomeModeSchema,
        fromTransactionsMinor: z.number().int()
    }),
    expensesMinor: z.number().int(),
    uncategorizedMinor: z.number().int(),
    uncategorizedCount: z.number().int(),
    uncategorizedInflowMinor: z.number().int(),
    savedMinor: z.number().int(),
    savingsRateBps: z.number().int().nullable(),
    goal: z.object({ bps: z.number().int(), minor: z.number().int() }),
    gapMinor: z.number().int(),
    fixedMinor: z.number().int(),
    fixedShareBps: z.number().int().nullable(),
    flexibleMinor: z.number().int(),
    transfersOutMinor: z.number().int(),
    averageMonths: z.number().int(),
    excludedCurrencyCount: z.number().int(),
    categories: z.array(categoryRowSchema),
    incomeCategories: z.array(categoryRowSchema)
});

export class UpdateSpendingSettingsDto extends createZodDto(updateSpendingSettingsSchema) {}
export class SummaryQueryDto extends createZodDto(summaryQuerySchema) {}
