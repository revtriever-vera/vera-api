import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { SendCategory } from '../usage.types';

const DECIMAL_PATTERN: RegExp = /^\d+(\.\d+)?$/;
const DEFAULT_CAP_MICROS: number = 4_000_000;
const DEFAULT_WARNING_BPS: number = 8000;
const DEFAULT_USD_BRL_FALLBACK: string = '5.0000';

const priceEntrySchema = z.object({
    currency: z.enum(['USD', 'BRL']),
    amount: z.string().regex(DECIMAL_PATTERN),
    date: z.string().min(1),
    source: z.string().min(1)
});

/**
 * Valores públicos da Meta para o Brasil (USD por mensagem entregue, vigentes desde 2025-07-01).
 * Fonte: developers.facebook.com/docs/whatsapp/pricing (rate card Brazil). Confira no painel da Meta.
 */
const META_PRICING_DATE: string = '2025-07-01';
const META_PRICING_SOURCE: string =
    'Meta WhatsApp Business Platform pricing, rate card Brazil (developers.facebook.com/docs/whatsapp/pricing)';
const DEFAULT_PRICE_TABLE: SendPriceTable = {
    utility: { currency: 'USD', amount: '0.0068', date: META_PRICING_DATE, source: META_PRICING_SOURCE },
    marketing: { currency: 'USD', amount: '0.0625', date: META_PRICING_DATE, source: META_PRICING_SOURCE },
    authentication: { currency: 'USD', amount: '0.0315', date: META_PRICING_DATE, source: META_PRICING_SOURCE }
};

const priceTableSchema = z
    .object({
        authentication: priceEntrySchema.optional(),
        utility: priceEntrySchema.optional(),
        marketing: priceEntrySchema.optional()
    })
    .strict();

export type SendPriceEntry = z.infer<typeof priceEntrySchema>;
export type SendPriceTable = Readonly<Partial<Record<SendCategory, SendPriceEntry>>>;

const priceTableEnvSchema = z
    .string()
    .default('{}')
    .transform((raw: string, context: z.RefinementCtx): SendPriceTable => {
        try {
            const parsed = priceTableSchema.safeParse(JSON.parse(raw));
            if (parsed.success) {
                return { ...DEFAULT_PRICE_TABLE, ...parsed.data };
            }
            context.addIssue({ code: z.ZodIssueCode.custom, message: 'WHATSAPP_PRICE_TABLE fora do formato esperado' });
        } catch {
            context.addIssue({ code: z.ZodIssueCode.custom, message: 'WHATSAPP_PRICE_TABLE não é JSON válido' });
        }
        return z.NEVER;
    });

const schema = z.object({
    PAID_USAGE_CAP_MICROS: z.coerce.number().int().min(0).default(DEFAULT_CAP_MICROS),
    PAID_USAGE_WARNING_BPS: z.coerce.number().int().min(1).max(10_000).default(DEFAULT_WARNING_BPS),
    USAGE_USD_BRL_FALLBACK: z.string().regex(DECIMAL_PATTERN).default(DEFAULT_USD_BRL_FALLBACK),
    WHATSAPP_PRICE_TABLE: priceTableEnvSchema,
    PAID_SEND_COST_MULTIPLIER: z.coerce.number().min(0).default(1)
});

export type UsageConfig = z.infer<typeof schema>;

export const usageConfig = registerAs('usage', (): UsageConfig => schema.parse(process.env));
