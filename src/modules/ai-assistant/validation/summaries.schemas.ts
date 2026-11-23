import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const MAX_GOAL_BPS: number = 9000;
const MAX_CONTRIBUTION_MINOR: number = 100_000_000_000;

const goalBps = z.number().int().min(0).max(MAX_GOAL_BPS);
const contributionMinor = z.number().int().min(1).max(MAX_CONTRIBUTION_MINOR);

export const summaryKindParamsSchema = z.object({
    kind: z.enum(['month', 'cuts', 'portfolio']).describe('Which summary: the month, the savings cuts or the portfolio')
});

export const summaryQuerySchema = z.object({
    month: z.string().optional().describe('Month, YYYY-MM, for month and cuts; defaults to the last closed month'),
    goalBps: z.coerce.number().pipe(goalBps).optional().describe('Simulated savings goal in basis points, for cuts'),
    contributionMinor: z.coerce.number().pipe(contributionMinor).optional().describe('Planned contribution in minor units, for portfolio')
});

export const summaryRegenerateBodySchema = z
    .object({
        month: z.string().optional().describe('Month, YYYY-MM, for month and cuts; defaults to the last closed month'),
        goalBps: goalBps.optional().describe('Simulated savings goal in basis points, for cuts'),
        contributionMinor: contributionMinor.optional().describe('Planned contribution in minor units, for portfolio')
    })
    .strict();

export const summaryResponseSchema = z.object({
    kind: z.enum(['month', 'cuts', 'portfolio']).describe('Which summary this is'),
    period: z.string().describe('Month (YYYY-MM) for month and cuts, day (YYYY-MM-DD) for portfolio'),
    paragraphs: z
        .array(z.string())
        .describe(
            'The text, names already in place of the markers; the main figure of a paragraph is wrapped in ** **, nothing else is markup'
        ),
    generatedAt: z.string().describe('When the text was written, ISO 8601'),
    cached: z.boolean().describe('The stored text was served, with no model call'),
    stale: z.boolean().describe('The figures changed after the stored text was written and the hourly limit did not allow a new one'),
    source: z.enum(['model', 'fixed']).describe('Written by the model or a fixed text with no model call'),
    usage: z
        .object({
            state: z.enum(['ok', 'warning', 'paused']).describe('State of the monthly paid usage cap'),
            usedBps: z.number().int().describe('Share of the cap used, in basis points'),
            resetsAt: z.string().describe('When the usage resets, ISO 8601')
        })
        .describe('Usage of the cap, so the card can show the band without another call')
});

export type SummaryKindParams = z.infer<typeof summaryKindParamsSchema>;
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;
export type SummaryRegenerateBody = z.infer<typeof summaryRegenerateBodySchema>;

export class SummaryKindParamsDto extends createZodDto(summaryKindParamsSchema) {}
export class SummaryQueryDto extends createZodDto(summaryQuerySchema) {}
export class SummaryRegenerateBodyDto extends createZodDto(summaryRegenerateBodySchema) {}
