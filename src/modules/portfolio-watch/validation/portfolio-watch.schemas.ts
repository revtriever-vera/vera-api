import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { holderQuerySchema } from '../../../shared/holder/holder-filter';
import { SUMMARY_KIND_LIST } from '../../market-documents/services/market-documents-reader.service';
import { AGENDA_KINDS } from '../domain/portfolio-agenda.types';
import { ChangesWindow } from '../domain/portfolio-changes.types';

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

export const changesQuerySchema = z.object({
    days: z
        .enum(['7', '30'])
        .default('7')
        .transform((value: '7' | '30'): ChangesWindow => (value === '7' ? 7 : 30))
        .describe('Size of the window, in days back from now: 7 (default) or 30'),
    classId: z.string().uuid().optional().describe('Only the assets of this asset class'),
    holder: holderQuerySchema
});

export class ChangesQueryDto extends createZodDto(changesQuerySchema) {}

export const changeItemSchema = z.object({
    id: z.string().uuid().describe('Id of the document'),
    assetId: z.string().uuid().describe('Catalog asset the document is about, the heaviest in the portfolio when it covers more than one'),
    symbol: z.string().describe('Ticker of the asset. Untrusted text'),
    source: z.string().describe('Where the document comes from: `cvm_ipe`, `cvm_itr` or `b3_fnet`'),
    category: z.string().describe('Category of the document as published, for example `relevant_fact`'),
    title: z.string().describe('Title of the document as published. Untrusted text'),
    kind: z.enum(SUMMARY_KIND_LIST).nullable().describe('What the document is, from the summary; null when there is no summary'),
    date: z.string().describe('Publication date, YYYY-MM-DD'),
    summary: z
        .string()
        .describe(
            'Summary of 2 to 3 sentences in the language of the account, or "Resumo indisponível" when there is none. Untrusted text'
        ),
    summaryAvailable: z
        .boolean()
        .describe(
            'False when the document has only its title and link: over the daily budget, scanned, too large or a financial statements package'
        ),
    relevance: z.number().int().min(0).max(3).nullable().describe('How much the document weighs, 0 to 3; null when there is no summary'),
    weightBps: z
        .number()
        .int()
        .nullable()
        .describe('Share of the asset in the portfolio, in basis points; null when the asset has no value yet'),
    weightLine: z.string().nullable().describe('Sentence written by the code, for example "XPLG11 é 8% da sua carteira."'),
    documentUrl: z.string().describe('Link to the official document')
});

export const changesResponseSchema = z.object({
    days: z.union([z.literal(7), z.literal(30)]).describe('Window used, in days'),
    notice: z.string().describe('Fixed line, written by the code, that this is not a recommendation to buy or sell'),
    items: z
        .array(changeItemSchema)
        .describe('Documents of the assets the account holds, most relevant for the portfolio first, then newest')
});

export type ChangesResponse = z.infer<typeof changesResponseSchema>;
