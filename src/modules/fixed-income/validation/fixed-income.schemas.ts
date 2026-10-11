import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CURRENCIES, INDEXERS, TAX_REGIMES, VALUATION_SOURCES, VALUATION_STATUSES } from '../domain/curve/curve.types';
import { MAX_TITLES_PER_COMPANY, TITLE_KINDS, TITLE_NAME_MAX_LENGTH, TITLE_NAME_MIN_LENGTH } from '../domain/fixed-income.types';
import { isRateWithinRange } from '../domain/terms-validation';

const CONTROL_CHARACTERS: RegExp = /^[^\p{Cc}]*$/u;
const ISO_DATE: RegExp = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
    const parsed: Date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

const dateSchema = z.string().regex(ISO_DATE).refine(isRealDate, { message: 'not a calendar date' });

const kindSchema = z.nativeEnum(TITLE_KINDS).describe('Kind of security: cdb, lci, lca, lc, debenture, cri or cra');
const nameSchema = z
    .string()
    .trim()
    .min(TITLE_NAME_MIN_LENGTH)
    .max(TITLE_NAME_MAX_LENGTH)
    .regex(CONTROL_CHARACTERS)
    .describe('Name given by the user, trimmed, 1 to 80 characters without control characters. Untrusted text');
const indexerSchema = z
    .nativeEnum(INDEXERS)
    .describe('Indexer: `cdi_percent` (percentage of CDI), `prefixed` or `ipca_plus` (IPCA + fixed rate)');
const rateSchema = z
    .number()
    .int()
    .describe(
        'Rate in basis points. `cdi_percent`: 100% of CDI = 10000 (1 to 30000). `prefixed` and `ipca_plus`: yearly rate, 12.5% = 1250 (prefixed 0 to 10000, ipca_plus 0 to 5000)'
    );
const currencySchema = z
    .nativeEnum(CURRENCIES)
    .describe('Currency of the security. `USD` only with the `prefixed` indexer; defaults to `BRL`');
const appliedMinorSchema = z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .describe('Applied amount in the smallest unit of the currency (cents), greater than zero');
const appliedAtSchema = dateSchema.describe('Application date, YYYY-MM-DD, from 2010-01-01 until today');
const maturityDateSchema = dateSchema.describe('Maturity date, YYYY-MM-DD, after the application date and at most 50 years ahead of it');

const termsShape = {
    kind: kindSchema,
    indexer: indexerSchema,
    rateBps: rateSchema,
    currency: currencySchema.optional(),
    appliedMinor: appliedMinorSchema,
    appliedAt: appliedAtSchema,
    maturityDate: maturityDateSchema
};

function rateMatchesIndexer(value: { indexer: z.infer<typeof indexerSchema>; rateBps: number }): boolean {
    return isRateWithinRange(value.indexer, value.rateBps);
}

const RATE_ISSUE = { message: 'rateBps is outside the range of the indexer', path: ['rateBps'] };

export const createFixedIncomeTitleSchema = z
    .object({
        ...termsShape,
        name: nameSchema,
        classId: z.string().uuid().optional().describe('Class of the security; omitted uses the class suggested by the indexer')
    })
    .strict()
    .refine(rateMatchesIndexer, RATE_ISSUE);

export const updateFixedIncomeTitleSchema = z
    .object({
        kind: kindSchema.optional(),
        name: nameSchema.optional(),
        indexer: indexerSchema.optional(),
        rateBps: rateSchema.optional(),
        currency: currencySchema.optional(),
        appliedMinor: appliedMinorSchema.optional(),
        appliedAt: appliedAtSchema.optional(),
        maturityDate: maturityDateSchema.optional()
    })
    .strict();

export const previewFixedIncomeSchema = z.object(termsShape).strict().refine(rateMatchesIndexer, RATE_ISSUE);

export const titleIdParamsSchema = z.object({ id: z.string().uuid().describe('Fixed income security id') });

export const valuationSchema = z.object({
    asOf: z.string().describe('Reference date of the valuation, YYYY-MM-DD (São Paulo time)'),
    valueMinor: z.number().int().describe('Gross value on the curve in the smallest unit of the security currency'),
    currency: z.nativeEnum(CURRENCIES).describe('Currency of the value'),
    accruedBps: z.number().int().describe('Gross yield accrued over the applied amount, in basis points'),
    matured: z.boolean().describe('The security reached maturity; the value is frozen at the maturity date'),
    estimated: z.boolean().describe('The value used projected business days or an unpublished IPCA'),
    status: z
        .nativeEnum(VALUATION_STATUSES)
        .describe('`index_data_missing`: the index series do not cover the period and the value is the applied amount'),
    source: z.nativeEnum(VALUATION_SOURCES).describe('Curve used: `curve_cdi`, `curve_pre` or `curve_ipca`'),
    taxRegime: z.nativeEnum(TAX_REGIMES).describe('`regressive` income tax or `exempt` (LCI and LCA)'),
    taxEstimatedMinor: z.number().int().describe('Estimated income tax. Detail only: never part of the net worth total'),
    netEstimatedMinor: z.number().int().describe('Value net of the estimated income tax. Detail only: never part of the net worth total')
});

export const fixedIncomeTitleViewSchema = z.object({
    id: z.string().uuid().describe('Fixed income security id'),
    kind: kindSchema,
    name: z.string().describe('Name given by the user'),
    indexer: indexerSchema,
    rateBps: rateSchema,
    currency: z.nativeEnum(CURRENCIES).describe('Currency of the security'),
    appliedMinor: appliedMinorSchema,
    appliedAt: z.string().describe('Application date, YYYY-MM-DD'),
    maturityDate: z.string().describe('Maturity date, YYYY-MM-DD'),
    classId: z.string().uuid().describe('Asset class the security belongs to'),
    createdAt: z.string().describe('Creation instant, ISO 8601'),
    updatedAt: z.string().describe('Last update instant, ISO 8601'),
    valuation: valuationSchema.describe(
        `Valuation of the security today. A company holds at most ${String(MAX_TITLES_PER_COMPANY)} securities`
    )
});

export class CreateFixedIncomeTitleDto extends createZodDto(createFixedIncomeTitleSchema) {}
export class UpdateFixedIncomeTitleDto extends createZodDto(updateFixedIncomeTitleSchema) {}
export class PreviewFixedIncomeDto extends createZodDto(previewFixedIncomeSchema) {}
export class TitleIdParamsDto extends createZodDto(titleIdParamsSchema) {}
