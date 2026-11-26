import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { BENCHMARK_STATES, CLASS_REASONS, COVERAGE_REASONS, INCOME_SOURCES } from '../domain/monthly-review.types';

const MONTH: RegExp = /^\d{4}-(0[1-9]|1[0-2])$/;

export const monthlyReviewPayloadSchema = z.object({ companyId: z.string().uuid(), month: z.string().regex(MONTH) });

export type MonthlyReviewPayload = z.infer<typeof monthlyReviewPayloadSchema>;

export const monthlyReviewParamsSchema = z.object({
    month: z.string().regex(MONTH).describe('Month of the review, YYYY-MM')
});

export class MonthlyReviewParamsDto extends createZodDto(monthlyReviewParamsSchema) {}

const pct = (description: string): z.ZodNumber => z.number().describe(description);

const classReturnSchema = z.object({
    classId: z.string().uuid().nullable().describe('Asset class; null for what could not be tied to a class'),
    startMinor: z.number().int().describe('Value of the class at the start of the month, minor units of the base currency'),
    endMinor: z.number().int().describe('Value of the class at the end of the month, minor units of the base currency'),
    returnPct: pct('Return of the class in the month, in percent. Absent when the operations do not explain the class').optional(),
    reason: z.nativeEnum(CLASS_REASONS).optional().describe('Why the class has no return')
});

const benchmarkSchema = z.object({
    state: z
        .nativeEnum(BENCHMARK_STATES)
        .describe('`ok`, `not_configured` (the index source has no token) or `no_data` (no reading for the month)'),
    returnPct: pct('Variation of the index in the month, in percent').nullable(),
    referenceMonth: z.string().regex(MONTH).nullable().describe('Month the reading refers to, YYYY-MM')
});

const priceMoveSchema = z.object({
    assetId: z.string().uuid().describe('Catalog asset'),
    symbol: z.string().describe('Ticker of the asset. Untrusted text'),
    variationPct: pct('Price variation between the two monthly photos, in percent. Market data, not an estimate of the account')
});

const issuerRowSchema = z.object({
    key: z.string().describe('Issuer group id or bucket key'),
    name: z.string().nullable().describe('Name of the issuer group, when known. Untrusted text'),
    valueMinor: z.number().int().describe('Value held, minor units of the base currency'),
    shareBps: z.number().int().describe('Share of the portfolio, basis points')
});

const sectorRowSchema = z.object({
    key: z.string().describe('Sector key'),
    valueMinor: z.number().int().describe('Value held, minor units of the base currency'),
    shareBps: z.number().int().describe('Share of the equity portfolio, basis points')
});

const fgcGroupSchema = z.object({
    groupId: z.string().describe('Financial conglomerate id'),
    groupName: z.string().describe('Name of the conglomerate. Untrusted text'),
    overMinor: z.number().int().describe('Amount above the FGC limit, minor units')
});

export const monthlyReviewSchema = z.object({
    month: z.string().regex(MONTH).describe('Month reviewed, YYYY-MM'),
    baseCurrency: z.string().describe('Base currency of every amount, ISO 4217'),
    returnPct: pct(
        'Return of the whole portfolio in the month, in percent. Absent unless every class is explained by the operations'
    ).optional(),
    byClass: z.array(classReturnSchema).describe('Value and return by asset class'),
    benchmarks: z.object({ cdi: benchmarkSchema, ipca: benchmarkSchema, ibovespa: benchmarkSchema }),
    topGainers: z.array(priceMoveSchema).max(3).describe('Assets that rose the most in price, up to 3'),
    topLosers: z.array(priceMoveSchema).max(3).describe('Assets that fell the most in price, up to 3'),
    income: z.object({
        amountMinor: z.number().int().describe('Income of the month, minor units of the base currency'),
        source: z
            .nativeEnum(INCOME_SOURCES)
            .describe('`operations` from the imported history, `ledger` from the position held on the ex-date')
    }),
    concentration: z.object({
        topIssuers: z.array(issuerRowSchema).describe('Largest issuers of the portfolio'),
        sectors: z.array(sectorRowSchema).describe('Sectors of the equity portfolio'),
        fgcExposure: z.object({
            overLimitMinor: z.number().int().describe('Total above the FGC limit per institution, minor units'),
            groups: z.array(fgcGroupSchema).describe('Conglomerates with an amount above the limit')
        })
    }),
    coverage: z.object({
        reason: z.nativeEnum(COVERAGE_REASONS).nullable().describe('Why the portfolio return is missing; null when it is there'),
        message: z.string().nullable().describe('Sentence written by the code explaining the missing return'),
        generatedAt: z.string().describe('When the review was built, ISO 8601')
    })
});

export type MonthlyReview = z.infer<typeof monthlyReviewSchema>;

export const monthlyReviewListSchema = z.object({
    items: z
        .array(
            z.object({
                month: z.string().regex(MONTH).describe('Month reviewed, YYYY-MM'),
                returnPct: pct('Return of the portfolio in the month, in percent').nullable()
            })
        )
        .describe('Months that have a review, newest first')
});

export type MonthlyReviewList = z.infer<typeof monthlyReviewListSchema>;

export const monthlyReviewParagraphsPropSchema = z.array(z.string());

export const monthlyReviewResponseSchema = monthlyReviewSchema.extend({
    summary: z
        .string()
        .nullable()
        .describe(
            'Paragraph written over the numbers (paragraphs separated by a blank line, the main figure wrapped in ** **); null on the free plan, without the permission to send the numbers, or when it was not written'
        )
});

export type MonthlyReviewResponse = z.infer<typeof monthlyReviewResponseSchema>;
