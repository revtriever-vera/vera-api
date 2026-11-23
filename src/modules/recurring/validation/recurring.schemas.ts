import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { SERIES_KINDS, SERIES_NAME_MAX_LENGTH, SERIES_ORIGINS, SERIES_STATUSES, STOPPED_BY } from '../domain/recurring-series.types';
import { CADENCES, VALUE_MODES } from '../domain/recurring.types';

const nameSchema = z
    .string()
    .trim()
    .min(1)
    .max(SERIES_NAME_MAX_LENGTH)
    .describe('Name of the series as the person sees it, up to 80 characters');
const cadenceSchema = z.nativeEnum(CADENCES).describe('How often the charge repeats');
const expectedDaySchema = z
    .number()
    .int()
    .min(1)
    .max(31)
    .nullable()
    .describe('Day of the month the charge is expected; 29 to 31 mean the last day of shorter months; null for weekly and biweekly');
const kindSchema = z.nativeEnum(SERIES_KINDS).describe('`subscription`, `bill` or `other`');

export const confirmSeriesSchema = z
    .object({
        name: nameSchema,
        cadence: cadenceSchema,
        expectedDay: expectedDaySchema,
        kind: kindSchema,
        categoryId: z
            .string()
            .uuid()
            .optional()
            .describe(
                'Category to apply to the charges. Only used together with `createRule`; ignored when a charge has a category the person set'
            ),
        createRule: z
            .boolean()
            .optional()
            .describe('"Always to this merchant": saves a categorization rule for the merchant and recategorizes the past charges')
    })
    .strict()
    .refine((body: { categoryId?: string; createRule?: boolean }): boolean => body.createRule !== true || body.categoryId !== undefined, {
        message: 'createRule needs a categoryId',
        path: ['categoryId']
    })
    .refine((body: { categoryId?: string; createRule?: boolean }): boolean => body.categoryId === undefined || body.createRule === true, {
        message: 'categoryId is only applied with createRule',
        path: ['createRule']
    });

export const updateSeriesSchema = z
    .object({
        name: nameSchema.optional(),
        cadence: cadenceSchema.optional(),
        expectedDay: expectedDaySchema.optional(),
        valueMode: z.nativeEnum(VALUE_MODES).optional().describe('`fixed` or `variable`'),
        kind: kindSchema.optional()
    })
    .strict()
    .refine((body: Record<string, unknown>): boolean => Object.values(body).some((value: unknown): boolean => value !== undefined), {
        message: 'send at least one field'
    });

export const createSeriesSchema = z
    .object({
        fromTransactionId: z.string().uuid().describe('Id of the transaction to mark as recurring. It has to be a debit'),
        name: nameSchema.optional()
    })
    .strict();

export const seriesIdParamsSchema = z.object({ id: z.string().uuid().describe('Series id') });

export const chargeParamsSchema = z.object({
    id: z.string().uuid().describe('Series id'),
    transactionId: z.string().uuid().describe('Transaction id')
});

export const seriesViewSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    merchantKey: z.string().describe('Key that groups the merchant across charges'),
    accountId: z.string().uuid().describe('Financial account of most charges'),
    cadence: cadenceSchema,
    valueMode: z.nativeEnum(VALUE_MODES),
    kind: kindSchema,
    status: z.nativeEnum(SERIES_STATUSES).describe('`suggested`, `confirmed`, `dismissed` or `stopped`'),
    origin: z.nativeEnum(SERIES_ORIGINS).describe('`detected` by the Vera or `manual`, from a transaction'),
    typicalAmountMinor: z.number().int().describe('Amount of the charge in BRL cents, always positive'),
    minAmountMinor: z.number().int(),
    maxAmountMinor: z.number().int(),
    expectedDay: expectedDaySchema,
    dayChange: z
        .object({ fromDay: z.number().int(), toDay: z.number().int() })
        .nullable()
        .describe('Set when the charge moved to another day of the month'),
    knownSubscription: z.boolean().describe('True when the merchant is a known subscription'),
    firstDate: z.string().describe('Date of the first charge, YYYY-MM-DD'),
    lastDate: z.string().describe('Date of the last charge, YYYY-MM-DD'),
    snoozedUntil: z.string().nullable().describe('YYYY-MM-DD while the suggestion is hidden'),
    confirmedAt: z.string().datetime().nullable(),
    dismissedAt: z.string().datetime().nullable(),
    stoppedAt: z.string().datetime().nullable(),
    stoppedBy: z.nativeEnum(STOPPED_BY).nullable().describe('`user` ("Cancelei") or `auto` (no charge in time)'),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
});

export const confirmedSeriesSchema = z.object({
    series: seriesViewSchema,
    categoryRule: z.object({
        created: z.boolean().describe('True when the "always to this merchant" rule was saved'),
        recategorized: z.number().int().describe('How many past transactions the rule moved')
    })
});

export type SeriesView = z.infer<typeof seriesViewSchema>;
export type ConfirmedSeriesView = z.infer<typeof confirmedSeriesSchema>;

export class ConfirmSeriesDto extends createZodDto(confirmSeriesSchema) {}
export class UpdateSeriesDto extends createZodDto(updateSeriesSchema) {}
export class CreateSeriesDto extends createZodDto(createSeriesSchema) {}
export class SeriesIdParamsDto extends createZodDto(seriesIdParamsSchema) {}
export class ChargeParamsDto extends createZodDto(chargeParamsSchema) {}

export const detectPayloadSchema = z.object({ companyId: z.string().uuid() });
