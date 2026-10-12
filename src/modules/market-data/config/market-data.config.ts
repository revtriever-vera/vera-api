import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { BUDGET_WINDOWS, BudgetLimits, BudgetWindow, QUOTE_PROVIDER_IDS, QuoteProviderId } from '../domain/market-data.types';

const optionalText = z
    .string()
    .optional()
    .transform((value: string | undefined): string | undefined => {
        const trimmed: string | undefined = value?.trim();
        return trimmed === undefined || trimmed === '' || trimmed.toLowerCase() === 'unset' ? undefined : trimmed;
    });

function withDefault(fallback: string): z.ZodType<string, z.ZodTypeDef, string | undefined> {
    return optionalText.transform((value: string | undefined): string => value ?? fallback);
}

const positiveInteger = z.coerce.number().int().positive();

const US_PROVIDER_IDS: ReadonlySet<string> = new Set<string>([
    QUOTE_PROVIDER_IDS.finnhub,
    QUOTE_PROVIDER_IDS.twelvedata,
    QUOTE_PROVIDER_IDS.alphavantage
]);

const usProviderList = withDefault('finnhub,twelvedata,alphavantage').transform((value: string): string[] =>
    value
        .split(',')
        .map((entry: string): string => entry.trim().toLowerCase())
        .filter((entry: string): boolean => US_PROVIDER_IDS.has(entry))
);

const schema = z.object({
    MARKET_DATA_DRIVER: optionalText.pipe(z.enum(['live', 'mock']).optional()),
    MARKET_DATA_HTTP_TIMEOUT_MS: withDefault('8000').pipe(positiveInteger),
    US_QUOTE_PROVIDERS: usProviderList,
    BRAPI_TOKEN: optionalText,
    BRAPI_BASE_URL: withDefault('https://brapi.dev/api').pipe(z.string().url()),
    BRAPI_MAX_TICKERS_PER_REQUEST: withDefault('1').pipe(positiveInteger),
    FINNHUB_API_KEY: optionalText,
    FINNHUB_BASE_URL: withDefault('https://finnhub.io/api/v1').pipe(z.string().url()),
    TWELVEDATA_API_KEY: optionalText,
    TWELVEDATA_BASE_URL: withDefault('https://api.twelvedata.com').pipe(z.string().url()),
    ALPHAVANTAGE_API_KEY: optionalText,
    ALPHAVANTAGE_BASE_URL: withDefault('https://www.alphavantage.co').pipe(z.string().url()),
    COINGECKO_API_KEY: optionalText,
    COINGECKO_BASE_URL: withDefault('https://api.coingecko.com/api/v3').pipe(z.string().url()),
    BCB_PTAX_BASE_URL: withDefault('https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata').pipe(z.string().url())
});

const DEFAULT_LIMITS: Readonly<Record<QuoteProviderId, BudgetLimits>> = {
    brapi: { month: 15_000 },
    finnhub: { minute: 50 },
    twelvedata: { minute: 8, day: 800 },
    alphavantage: { day: 25 },
    coingecko: { minute: 100, month: 10_000 },
    tesouro: {}
};

export type MarketDataSettings = z.infer<typeof schema> & {
    readonly LIMITS: Readonly<Record<QuoteProviderId, BudgetLimits>>;
    readonly DRIVER: 'live' | 'mock';
};

export function limitVariable(provider: QuoteProviderId, window: BudgetWindow): string {
    return `${provider.toUpperCase()}_LIMIT_${window.toUpperCase()}`;
}

function limitOf(env: NodeJS.ProcessEnv, provider: QuoteProviderId, window: BudgetWindow): number | undefined {
    const raw: string | undefined = env[limitVariable(provider, window)]?.trim();
    if (raw === undefined || raw === '') {
        return DEFAULT_LIMITS[provider][window];
    }
    return positiveInteger.parse(raw);
}

function limitsOf(env: NodeJS.ProcessEnv, provider: QuoteProviderId): BudgetLimits {
    const entries: [BudgetWindow, number][] = Object.values(BUDGET_WINDOWS).flatMap((window: BudgetWindow): [BudgetWindow, number][] => {
        const limit: number | undefined = limitOf(env, provider, window);
        return limit === undefined ? [] : [[window, limit]];
    });
    return Object.fromEntries(entries);
}

function hasAnyKey(parsed: z.infer<typeof schema>): boolean {
    return [
        parsed.BRAPI_TOKEN,
        parsed.FINNHUB_API_KEY,
        parsed.TWELVEDATA_API_KEY,
        parsed.ALPHAVANTAGE_API_KEY,
        parsed.COINGECKO_API_KEY
    ].some((value: string | undefined): boolean => value !== undefined);
}

export function parseMarketDataConfig(env: NodeJS.ProcessEnv): MarketDataSettings {
    const parsed: z.infer<typeof schema> = schema.parse(env);
    const limits: Record<string, BudgetLimits> = Object.fromEntries(
        Object.values(QUOTE_PROVIDER_IDS).map((provider: QuoteProviderId): [QuoteProviderId, BudgetLimits] => [
            provider,
            limitsOf(env, provider)
        ])
    );
    const driver: 'live' | 'mock' = parsed.MARKET_DATA_DRIVER ?? (hasAnyKey(parsed) ? 'live' : 'mock');
    return { ...parsed, DRIVER: driver, LIMITS: limits as Readonly<Record<QuoteProviderId, BudgetLimits>> };
}

export const marketDataConfig = registerAs('marketData', (): MarketDataSettings => parseMarketDataConfig(process.env));
