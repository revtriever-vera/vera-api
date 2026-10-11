import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const optionalText = z
    .string()
    .optional()
    .transform((value: string | undefined): string | undefined => {
        const trimmed: string | undefined = value?.trim();
        return trimmed === undefined || trimmed === '' ? undefined : trimmed;
    });

function withDefault(fallback: string): z.ZodType<string, z.ZodTypeDef, string | undefined> {
    return optionalText.transform((value: string | undefined): string => value ?? fallback);
}

const optionalUrl = optionalText.refine(
    (value: string | undefined): boolean => value === undefined || URL.canParse(value.replace('{date}', '2000-01-01')),
    {
        message: 'URL inválida'
    }
);

const schema = z.object({
    CATALOG_DRIVER: optionalText.pipe(z.enum(['live', 'mock']).default('mock')),
    B3_INSTRUMENTS_URL: optionalUrl,
    TESOURO_PRICES_CSV_URL: optionalUrl,
    FINNHUB_API_KEY: optionalText,
    FINNHUB_BASE_URL: withDefault('https://finnhub.io/api/v1').pipe(z.string().url()),
    COINGECKO_API_KEY: optionalText,
    COINGECKO_BASE_URL: withDefault('https://api.coingecko.com/api/v3').pipe(z.string().url()),
    CATALOG_HTTP_TIMEOUT_MS: withDefault('20000').pipe(z.coerce.number().int().positive())
});

export type CatalogConfig = z.infer<typeof schema>;

export const catalogConfig = registerAs('catalog', (): CatalogConfig => schema.parse(process.env));
