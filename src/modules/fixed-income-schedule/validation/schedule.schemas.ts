import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { MATURITIES_DEFAULT_LIMIT, MATURITIES_MAX_LIMIT } from '../domain/schedule.types';

const minor = (description: string): z.ZodNumber => z.number().int().describe(description);
const bps = (description: string): z.ZodNumber => z.number().int().describe(description);
const isoDate = (description: string): z.ZodString => z.string().describe(description);
const taxRegimeSchema = z.enum(['regressive', 'exempt']);

export const maturitiesQuerySchema = z.object({
    limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(MATURITIES_MAX_LIMIT)
        .default(MATURITIES_DEFAULT_LIMIT)
        .describe('Maximum number of rows, nearest maturity first. From 1 to 500, default 50')
});

const maturityReferenceSchema = z.object({
    cdiAnnualBps: bps('Latest daily CDI annualized over 252 business days, in basis points; null without a CDI series').nullable(),
    ipca12mBps: bps('IPCA accumulated over the last 12 published months, in basis points; null without 12 consecutive months').nullable(),
    cdiDate: isoDate('Date of the CDI point used, YYYY-MM-DD; null without a CDI series').nullable(),
    ipcaMonth: z.string().describe('Last published IPCA month used, YYYY-MM; null without 12 consecutive months').nullable()
});

export const maturityItemSchema = z.object({
    holdingKind: z.enum(['fixed_income', 'position']).describe('fixed_income: security of the company; position: Tesouro Direto position'),
    id: z.string().describe('Security id or position id, according to holdingKind'),
    name: z.string().describe('Security name given by the user, or Tesouro Direto title symbol. Untrusted text'),
    issuerName: z.string().nullable().describe('Issuer from the curated list; null for Tesouro Direto or an issuer not informed'),
    kind: z.string().nullable().describe('Kind of fixed income security (cdb, lci, ...); null for a position'),
    maturityDate: isoDate('Maturity date, YYYY-MM-DD'),
    daysToMaturity: z.number().int().describe('Calendar days from today to the maturity, in the company time zone; 0 on the maturity day'),
    soon: z.boolean().describe('True when the maturity is 90 days away or less'),
    estimatedValueMinor: minor('Estimated gross value on the maturity date, before income tax, in BRL minor units'),
    currency: z.literal('BRL').describe('Currency of estimatedValueMinor and reallocateMinor; always BRL'),
    reallocateMinor: minor('Estimated value rounded down to a multiple of R$ 100, the amount to carry to the contribution suggestion'),
    estimated: z.boolean().describe('True when the value rests on an assumption (missing series, USD conversion, inflation only)'),
    basis: z
        .enum(['contract', 'cdi_projection', 'ipca_projection', 'inflation_only', 'face_value'])
        .describe(
            'contract: contracted rate; cdi_projection: today CDI held constant; ipca_projection: 12-month IPCA held constant plus the contracted rate; inflation_only: 12-month IPCA only, the contracted rate is unknown; face_value: R$ 1,000 per unit'
        ),
    taxRegime: taxRegimeSchema.nullable().describe('Income tax regime of the security (exempt for LCI and LCA); null for a position'),
    isSample: z.boolean().describe('True for example data')
});

export const maturitiesResponseSchema = z.object({
    asOf: isoDate('Reference date in the company time zone, YYYY-MM-DD'),
    reference: maturityReferenceSchema.describe('Reference rates used by the projection'),
    items: z.array(maturityItemSchema).describe('Securities and Tesouro Direto positions that mature today or later, nearest first')
});

export const realRateItemSchema = z.object({
    id: z.string().describe('Security id'),
    name: z.string().describe('Security name given by the user. Untrusted text'),
    kind: z.string().describe('Kind of security (cdb, lci, ...)'),
    indexer: z.enum(['cdi_percent', 'prefixed', 'ipca_plus']).describe('Indexer of the security'),
    rateBps: bps('Contracted rate in basis points, as registered'),
    appliedMinor: minor('Applied amount, in BRL minor units'),
    appliedAt: isoDate('Application date, YYYY-MM-DD'),
    valueMinor: minor('Gross value today, in BRL minor units'),
    nominalAnnualBps: bps(
        'Nominal yearly rate in basis points, with CDI and IPCA held at their reference values; null without the CDI series'
    ).nullable(),
    realAnnualBps: bps('Yearly rate above the 12-month IPCA, in basis points; null when the nominal rate is unknown').nullable(),
    lowReal: z.boolean().describe('True when the real rate is below 3% a year'),
    correctedMinor: minor('Applied amount corrected by the IPCA published since the application date'),
    purchasingPowerGainMinor: minor('valueMinor minus correctedMinor; negative when the security lost against inflation'),
    purchasingPowerGainBps: bps('Purchasing power gain over correctedMinor, in basis points'),
    taxRegime: taxRegimeSchema.describe('Income tax regime; every figure is before income tax'),
    estimated: z.boolean().describe('True when a series is missing or incomplete for this row')
});

export const realRatesResponseSchema = z.object({
    asOf: isoDate('Reference date in the company time zone, YYYY-MM-DD'),
    reference: z
        .object({
            ipca12mBps: bps('IPCA accumulated over the last 12 published months, in basis points'),
            ipcaMonth: z.string().describe('Last published IPCA month used, YYYY-MM')
        })
        .describe('Reference rate used by the calculation'),
    items: z.array(realRateItemSchema).describe('BRL securities not yet matured, nearest maturity first. Every figure is before income tax')
});

export class MaturitiesQueryDto extends createZodDto(maturitiesQuerySchema) {}

export type MaturitiesResponse = z.infer<typeof maturitiesResponseSchema>;
export type RealRatesResponse = z.infer<typeof realRatesResponseSchema>;
