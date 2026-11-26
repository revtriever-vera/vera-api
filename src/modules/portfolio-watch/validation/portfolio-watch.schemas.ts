import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { holderQuerySchema } from '../../../shared/holder/holder-filter';
import { AGENDA_KINDS } from '../domain/portfolio-agenda.types';

const ISO_DATE: RegExp = /^\d{4}-\d{2}-\d{2}$/;

export const snapshotPayloadSchema = z.object({ companyId: z.string().uuid() });

export type SnapshotPayload = z.infer<typeof snapshotPayloadSchema>;

export const dailyPayloadSchema = z.object({ companyId: z.string().uuid() });

export type DailyPayload = z.infer<typeof dailyPayloadSchema>;

export const watchDigestEntrySchema = z.object({
    type: z.string(),
    name: z.string(),
    date: z.string().regex(ISO_DATE),
    days: z.coerce.number().int(),
    paymentDate: z.string(),
    amountPerUnit: z.string(),
    currency: z.string(),
    documentUrl: z.string()
});

export const watchDigestEntriesSchema = z.array(watchDigestEntrySchema).min(1);

export type WatchDigestEntry = z.infer<typeof watchDigestEntrySchema>;

export const watchDigestUnsubscribeSchema = z.record(z.string(), z.string());

const dateParam = (description: string): z.ZodEffects<z.ZodString, string, string> =>
    z
        .string()
        .regex(ISO_DATE)
        .refine((value: string): boolean => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'not a calendar date')
        .describe(description);

export const agendaQuerySchema = z.object({
    from: dateParam('First day of the window, YYYY-MM-DD, inclusive'),
    to: dateParam('Last day of the window, YYYY-MM-DD, inclusive. At most 366 days after `from`'),
    holder: holderQuerySchema
});

export class AgendaQueryDto extends createZodDto(agendaQuerySchema) {}

export const agendaItemSchema = z.object({
    id: z.string().uuid().describe('Id of the event, or of the security or Tesouro Direto position that matures'),
    kind: z
        .enum(AGENDA_KINDS)
        .describe('What happens: a payout, an assembly, an earnings release or the maturity of a fixed income holding'),
    assetId: z.string().uuid().nullable().describe('Catalog asset the event is about; null for the maturity of a fixed income security'),
    holdingId: z
        .string()
        .uuid()
        .nullable()
        .describe('Fixed income security id or Tesouro Direto position id; null for an event of an asset'),
    name: z.string().describe('Ticker of the asset, or name of the security. Untrusted text'),
    date: z.string().describe('Date the item sorts by, YYYY-MM-DD: the earliest of its dates that falls inside the window'),
    exDate: z.string().nullable().describe('Ex-date (data-com), YYYY-MM-DD; null when it does not apply'),
    paymentDate: z.string().nullable().describe('Payment date, YYYY-MM-DD; null when it does not apply or is not announced'),
    eventDate: z.string().nullable().describe('Date of the assembly, of the release or of the maturity, YYYY-MM-DD; null for a payout'),
    amountPerUnit: z.string().nullable().describe('Amount per unit held, decimal string in `currency`; null when the notice has none'),
    currency: z.string().describe('Currency of the amounts, ISO 4217'),
    amountForAccountMinor: z
        .number()
        .int()
        .nullable()
        .describe(
            'Estimated amount for the account in minor units of `currency`: current quantity x amount per unit, or the projected value at maturity'
        ),
    estimated: z.boolean().describe('True when `amountForAccountMinor` rests on today quantity or on a projection, so it can change'),
    documentUrl: z.string().nullable().describe('Link to the notice that announced the event, when there is one')
});

export const agendaResponseSchema = z.object({
    from: z.string().describe('First day of the window, YYYY-MM-DD'),
    to: z.string().describe('Last day of the window, YYYY-MM-DD'),
    items: z.array(agendaItemSchema).describe('Events of the assets the account holds and fixed income maturities, earliest first')
});

export type AgendaResponse = z.infer<typeof agendaResponseSchema>;
