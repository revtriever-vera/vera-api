import { z } from 'zod';

const ONBOARDING_STATUS_VALUES = ['welcome', 'assets', 'banks', 'summary', 'closed'] as const;

export const onboardingStepStampsSchema = z.object({
    doneAt: z.string().datetime().nullable().describe('When the step was completed, or null'),
    skippedAt: z.string().datetime().nullable().describe('When the step was skipped, or null')
});

export const onboardingStateSchema = z.object({
    status: z
        .enum(ONBOARDING_STATUS_VALUES)
        .describe('Derived: `closed` once finished or dismissed, otherwise the first screen still open'),
    startedAt: z.string().datetime().nullable().describe('When the person left the welcome screen, or null'),
    steps: z.object({
        assets: onboardingStepStampsSchema.describe('Assets step, optional'),
        banks: onboardingStepStampsSchema.describe('Banks and spending step, optional')
    }),
    completedAt: z.string().datetime().nullable().describe('When the person went to the dashboard from the summary, or null'),
    dismissedAt: z.string().datetime().nullable().describe('When the person skipped the whole setup, or null'),
    sample: z.object({
        active: z.boolean().describe('True while sample data is loaded'),
        available: z.boolean().describe('True when a sample data provider is registered')
    })
});

export type OnboardingStateResponse = z.infer<typeof onboardingStateSchema>;

export const onboardingAreaSummarySchema = z
    .object({
        items: z.number().int().describe('How many items were configured in the area'),
        amountCents: z.number().int().nullable().describe('Total amount in integer cents, or null when the area has no amount'),
        currency: z.string().nullable().describe('Currency of `amountCents`, or null'),
        breakdown: z.record(z.string(), z.number()).optional().describe('Area specific counters, such as banks `connections` and `imports`')
    })
    .nullable()
    .describe('Null when no module registered a summary for the area or it failed');

export const onboardingSummarySchema = z.object({
    assets: onboardingAreaSummarySchema,
    banks: onboardingAreaSummarySchema,
    target: onboardingAreaSummarySchema
});

export type OnboardingSummaryResponse = z.infer<typeof onboardingSummarySchema>;
