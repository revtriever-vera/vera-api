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
    PORTFOLIO_EVENTS_FNET_ENABLED: flag,
    PORTFOLIO_EVENTS_CVM_IPE_ENABLED: flag,
    PORTFOLIO_EVENTS_CVM_REQUEST_SPACING_MS: withDefault('2000').pipe(nonNegativeInteger),
    PORTFOLIO_EVENTS_CVM_MAX_NOTICES: withDefault('12').pipe(positiveInteger),
    PORTFOLIO_EVENTS_FNET_BASE_URL: withDefault('https://fnet.bmfbovespa.com.br/fnet/publico').pipe(z.string().url()),
    PORTFOLIO_EVENTS_HTTP_TIMEOUT_MS: withDefault('8000').pipe(positiveInteger),
    PORTFOLIO_EVENTS_REQUEST_SPACING_MS: withDefault('10000').pipe(nonNegativeInteger),
    PORTFOLIO_EVENTS_BATCH_SIZE: withDefault('5').pipe(positiveInteger),
    PORTFOLIO_EVENTS_BATCH_SPACING_MS: withDefault('60000').pipe(nonNegativeInteger),
    PORTFOLIO_EVENTS_LOOKBACK_DAYS: withDefault('45').pipe(positiveInteger),
    PORTFOLIO_EVENTS_USER_AGENT: withDefault('Mozilla/5.0 (compatible; portfolio-events)')
});

export type PortfolioEventsSettings = z.infer<typeof schema>;

export function parsePortfolioEventsConfig(env: NodeJS.ProcessEnv): PortfolioEventsSettings {
    return schema.parse(env);
}

export const portfolioEventsConfig = registerAs('portfolioEvents', (): PortfolioEventsSettings => parsePortfolioEventsConfig(process.env));
