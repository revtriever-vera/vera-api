import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ALERT_KINDS, CALENDAR_DEFAULT_DAYS, CALENDAR_MAX_DAYS } from '../domain/recurring-alerts.types';
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

const moneySchema = z.number().int();

export const calendarQuerySchema = z.object({
    days: z.coerce
        .number()
        .int()
        .min(1)
        .max(CALENDAR_MAX_DAYS)
        .default(CALENDAR_DEFAULT_DAYS)
        .describe('How many days ahead to forecast, from today in the company time zone. Default 60, up to 90')
});

export const alertIdParamsSchema = z.object({ id: z.string().uuid().describe('Alert id') });

export const lastChargeSchema = z.object({
    transactionId: z.string().uuid(),
    date: z.string().describe('YYYY-MM-DD'),
    amountMinor: moneySchema.describe('Amount in BRL cents, positive')
});

export const itemViewSchema = seriesViewSchema.extend({
    accountName: z.string().describe('Name of the financial account of the series'),
    institutionName: z.string().nullable(),
    accountKind: z.string().describe('`checking`, `savings`, `credit_card` or `other`'),
    nextDate: z.string().nullable().describe('Next expected charge, YYYY-MM-DD. Null when the series is stopped or dismissed'),
    monthlyEquivalentMinor: moneySchema.describe('What the series costs per month: weekly x52/12, biweekly x26/12, annual /12 and so on'),
    lastCharges: z.array(lastChargeSchema).describe('Up to the 3 last charges. Filled only for the list "review"')
});

export const totalsSchema = z.object({
    monthlyMinor: moneySchema.describe('Sum of the monthly equivalents of the confirmed series, in BRL cents'),
    yearlyMinor: moneySchema.describe('`monthlyMinor` x 12'),
    byKind: z
        .object({
            subscription: moneySchema,
            bill: moneySchema,
            other: moneySchema
        })
        .describe('Monthly total of the confirmed series by type'),
    suggestions: z
        .object({ count: z.number().int(), monthlyMinor: moneySchema })
        .describe('Suggestions to review. They are not part of the total')
});

export const alertViewSchema = z.object({
    id: z.string().describe('Row id for the stored alerts (uuid) or `<kind>:<seriesId>` for the ones computed from the date'),
    kind: z
        .nativeEnum(ALERT_KINDS)
        .describe('`price_increase`, `duplicate_charge`, `duplicate_account`, `trial_converted`, `returned`, `still_using` or `renewal`'),
    seriesId: z.string().uuid(),
    seriesName: z.string(),
    occurredOn: z.string().describe('Date of the charge that raised the alert, YYYY-MM-DD'),
    canMarkSeen: z.boolean().describe('True when `POST /spending/recurring/alerts/{id}/seen` clears the alert'),
    data: z
        .record(z.string(), z.union([z.string(), z.number()]))
        .describe(
            'Numbers and dates for the text. price_increase: fromAmountMinor, toAmountMinor, percent, chargeDate. duplicate_charge: ' +
                'firstDate, firstAmountMinor, secondDate, secondAmountMinor. duplicate_account: accountId, accountName, otherAccountId, ' +
                'otherAccountName, otherSeriesId, amountMinor, otherAmountMinor. trial_converted: trialAmountMinor, firstAmountMinor, ' +
                'chargeDate. returned: lastDate, returnDate, amountMinor, gapDays. still_using: chargeCount, amountMinor. renewal: ' +
                'renewalDate, amountMinor, daysUntil'
        )
});

export const overviewSchema = z.object({
    totals: totalsSchema,
    review: z.array(itemViewSchema).describe('Suggestions to review, without the ones snoozed'),
    confirmed: z.array(itemViewSchema),
    stopped: z.array(itemViewSchema),
    dismissed: z.array(itemViewSchema).describe('Series the person said are not recurring; `restore` brings them back'),
    alerts: z.array(alertViewSchema).describe('Alerts not marked as seen, newest first')
});

export const calendarEntrySchema = z.object({
    date: z.string().describe('Expected date, YYYY-MM-DD'),
    state: z.enum(['upcoming', 'missed']).describe('`missed`: the charge did not arrive within the tolerance of the expected date'),
    seriesId: z.string().uuid(),
    name: z.string(),
    amountMinor: moneySchema.describe('Expected amount in BRL cents; an estimate when `isEstimate`'),
    isEstimate: z.boolean().describe('True for variable series'),
    isSuggestion: z.boolean().describe('True when the series was not confirmed yet'),
    accountId: z.string().uuid(),
    accountName: z.string(),
    institutionName: z.string().nullable(),
    accountKind: z.string().describe('`credit_card` means the real debit comes in the card bill, whose date the Vera does not predict')
});

export const calendarSchema = z.array(calendarEntrySchema);

export const alertSeenSchema = z.object({ id: z.string().uuid(), seen: z.boolean() });

export type ItemView = z.infer<typeof itemViewSchema>;
export type AlertView = z.infer<typeof alertViewSchema>;
export type OverviewView = z.infer<typeof overviewSchema>;
export type CalendarEntryView = z.infer<typeof calendarEntrySchema>;
export type AlertSeenView = z.infer<typeof alertSeenSchema>;

export class CalendarQueryDto extends createZodDto(calendarQuerySchema) {}
export class AlertIdParamsDto extends createZodDto(alertIdParamsSchema) {}

export const OVERVIEW_TOPICS = { week: 'week', subscriptions: 'subscriptions' } as const;

export const overviewToolInputSchema = z
    .object({
        topic: z
            .enum([OVERVIEW_TOPICS.week, OVERVIEW_TOPICS.subscriptions])
            .default(OVERVIEW_TOPICS.week)
            .describe('`week` for the debits until Sunday; `subscriptions` for the monthly and yearly cost of the confirmed subscriptions')
    })
    .strict();
