import { ConfigType } from '@nestjs/config';
import { vi } from 'vitest';
import { marketDataConfig, parseMarketDataConfig } from '../config/market-data.config';
import { ProviderAsset } from '../ports/quote-provider.port';
import { ProviderBudgetService } from '../services/provider-budget.service';

export const FAKE_KEY: string = 'test-key-not-real';

export function testConfig(overrides: Record<string, string> = {}): ConfigType<typeof marketDataConfig> {
    return parseMarketDataConfig({
        BRAPI_TOKEN: FAKE_KEY,
        FINNHUB_API_KEY: FAKE_KEY,
        TWELVEDATA_API_KEY: FAKE_KEY,
        ALPHAVANTAGE_API_KEY: FAKE_KEY,
        COINGECKO_API_KEY: FAKE_KEY,
        BRAPI_BASE_URL: 'https://brapi.test/api',
        FINNHUB_BASE_URL: 'https://finnhub.test/api/v1',
        TWELVEDATA_BASE_URL: 'https://twelvedata.test',
        ALPHAVANTAGE_BASE_URL: 'https://alphavantage.test',
        COINGECKO_BASE_URL: 'https://coingecko.test/api/v3',
        BCB_PTAX_BASE_URL: 'https://ptax.test/odata',
        ...overrides
    });
}

export function budget(answers: boolean[] = []): { service: ProviderBudgetService; reserve: ReturnType<typeof vi.fn> } {
    const reserve: ReturnType<typeof vi.fn> = vi.fn();
    answers.forEach((answer: boolean) => reserve.mockResolvedValueOnce(answer));
    reserve.mockResolvedValue(true);
    return { service: { reserve } as unknown as ProviderBudgetService, reserve };
}

export function asset(externalId: string, market: ProviderAsset['market'] = 'B3', currency: string = 'BRL'): ProviderAsset {
    return { assetId: `id-${externalId}`, market, externalId, symbol: externalId, currency };
}

export function jsonResponse(body: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
