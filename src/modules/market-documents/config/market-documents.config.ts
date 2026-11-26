import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const flag = z
    .enum(['true', 'false'])
    .optional()
    .transform((value: string | undefined): boolean => value === 'true');

const positiveInteger = z.coerce.number().int().positive();
const nonNegativeInteger = z.coerce.number().int().nonnegative();

function withDefault(fallback: string): z.ZodType<string, z.ZodTypeDef, string | undefined> {
    return z
        .string()
        .optional()
        .transform((value: string | undefined): string => (value === undefined || value.trim() === '' ? fallback : value.trim()));
}

const schema = z.object({
    MARKET_DOC_CVM_IPE_ENABLED: flag,
    MARKET_DOC_CVM_ITR_ENABLED: flag,
    MARKET_DOC_FNET_ENABLED: flag,
    MARKET_DOC_FNET_BASE_URL: withDefault('https://fnet.bmfbovespa.com.br/fnet/publico').pipe(z.string().url()),
    MARKET_DOC_LOOKBACK_DAYS: withDefault('7').pipe(positiveInteger),
    MARKET_DOC_MAX_CHARS: withDefault('60000').pipe(positiveInteger),
    MARKET_DOC_MAX_BYTES: withDefault('5000000').pipe(positiveInteger),
    MARKET_DOC_EXTRACT_BATCH: withDefault('20').pipe(positiveInteger),
    MARKET_DOC_SUMMARY_BATCH: withDefault('20').pipe(positiveInteger),
    MARKET_DOC_MAX_ATTEMPTS: withDefault('3').pipe(positiveInteger),
    MARKET_DOC_RETENTION_DAYS: withDefault('365').pipe(positiveInteger),
    MARKET_DOC_REQUEST_SPACING_MS: withDefault('10000').pipe(nonNegativeInteger),
    MARKET_DOC_HTTP_TIMEOUT_MS: withDefault('15000').pipe(positiveInteger),
    MARKET_DOC_USER_AGENT: withDefault('Mozilla/5.0 (compatible; market-documents)')
});

export type MarketDocumentsSettings = z.infer<typeof schema>;

export function parseMarketDocumentsConfig(env: NodeJS.ProcessEnv): MarketDocumentsSettings {
    return schema.parse(env);
}

export const marketDocumentsConfig = registerAs('marketDocuments', (): MarketDocumentsSettings => parseMarketDocumentsConfig(process.env));
