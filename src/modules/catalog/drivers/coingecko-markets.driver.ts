import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';
import { CoinMarket, coingeckoMarketsSchema } from '../validation/catalog.schemas';
import { catalogConfig } from '../config/catalog.config';
import { CatalogSourceError } from '../domain/catalog.errors';
import { ASSET_KINDS, CATALOG_SOURCES, CatalogSource, SOURCE_ERROR_CODES } from '../domain/catalog.types';
import { AssetSourcePort, SourceAsset } from '../ports/asset-source.port';
import { fetchSourceOk, readJson } from './source-fetch';

const PAGES: number = 4;
const PAGE_SIZE: number = 250;

@Injectable()
export class CoinGeckoMarketsDriver extends AssetSourcePort {
    public readonly source: CatalogSource = CATALOG_SOURCES.crypto;

    public constructor(@Inject(catalogConfig.KEY) private readonly config: ConfigType<typeof catalogConfig>) {
        super();
    }

    public async fetchAll(): Promise<readonly SourceAsset[]> {
        const key: string | undefined = this.config.COINGECKO_API_KEY;
        if (key === undefined) {
            throw new CatalogSourceError(SOURCE_ERROR_CODES.rejected);
        }
        const coins: CoinMarket[] = [];
        for (let page: number = 1; page <= PAGES; page += 1) {
            coins.push(...(await this.page(page, key)));
        }
        return this.ranked(coins);
    }

    private async page(page: number, key: string): Promise<CoinMarket[]> {
        const url: string = `${this.config.COINGECKO_BASE_URL}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${String(PAGE_SIZE)}&page=${String(page)}`;
        const response: Response = await fetchSourceOk(url, { 'x-cg-demo-api-key': key }, this.config.CATALOG_HTTP_TIMEOUT_MS);
        const parsed: z.SafeParseReturnType<unknown, CoinMarket[]> = coingeckoMarketsSchema.safeParse(await readJson(response));
        if (!parsed.success) {
            throw new CatalogSourceError(SOURCE_ERROR_CODES.formatInvalid);
        }
        return parsed.data;
    }

    private ranked(coins: readonly CoinMarket[]): SourceAsset[] {
        const unique: Map<string, CoinMarket> = new Map<string, CoinMarket>(
            coins.map((coin: CoinMarket): [string, CoinMarket] => [coin.id, coin])
        );
        return [...unique.values()]
            .sort((left: CoinMarket, right: CoinMarket) => (left.market_cap_rank ?? Infinity) - (right.market_cap_rank ?? Infinity))
            .map((coin: CoinMarket, index: number): SourceAsset => ({
                externalId: coin.id,
                symbol: coin.symbol.toUpperCase(),
                name: coin.name,
                kind: ASSET_KINDS.crypto,
                currency: 'USD',
                rank: coin.market_cap_rank ?? index + 1,
                raw: { id: coin.id }
            }));
    }
}
