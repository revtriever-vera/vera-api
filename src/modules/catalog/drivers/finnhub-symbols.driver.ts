import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';
import { FinnhubSymbol, finnhubSymbolsSchema } from '../validation/catalog.schemas';
import { catalogConfig } from '../config/catalog.config';
import { CatalogSourceError } from '../domain/catalog.errors';
import { ASSET_KINDS, AssetKind, CATALOG_SOURCES, CatalogSource, SOURCE_ERROR_CODES } from '../domain/catalog.types';
import { AssetSourcePort, SourceAsset } from '../ports/asset-source.port';
import { fetchSourceOk, readJson } from './source-fetch';

const ALLOWED_EXCHANGES: ReadonlySet<string> = new Set<string>(['XNYS', 'XNAS', 'XASE', 'ARCX']);

const KIND_BY_TYPE: Readonly<Record<string, AssetKind>> = {
    'Common Stock': ASSET_KINDS.stock,
    ADR: ASSET_KINDS.stock,
    ETP: ASSET_KINDS.etf,
    REIT: ASSET_KINDS.reit
};

function assetOf(entry: FinnhubSymbol): SourceAsset | null {
    const kind: AssetKind | undefined = KIND_BY_TYPE[entry.type];
    if (kind === undefined || !ALLOWED_EXCHANGES.has(entry.mic)) {
        return null;
    }
    return {
        externalId: entry.symbol,
        symbol: entry.symbol,
        name: entry.description === '' ? entry.symbol : entry.description,
        kind,
        currency: 'USD',
        raw: { type: entry.type, mic: entry.mic }
    };
}

@Injectable()
export class FinnhubSymbolsDriver extends AssetSourcePort {
    public readonly source: CatalogSource = CATALOG_SOURCES.us;

    public constructor(@Inject(catalogConfig.KEY) private readonly config: ConfigType<typeof catalogConfig>) {
        super();
    }

    public async fetchAll(): Promise<readonly SourceAsset[]> {
        const key: string | undefined = this.config.FINNHUB_API_KEY;
        if (key === undefined) {
            throw new CatalogSourceError(SOURCE_ERROR_CODES.rejected);
        }
        const entries: FinnhubSymbol[] = await this.download(key);
        const assets: Map<string, SourceAsset> = new Map<string, SourceAsset>();
        for (const entry of entries) {
            const asset: SourceAsset | null = assetOf(entry);
            if (asset !== null) {
                assets.set(asset.externalId, asset);
            }
        }
        return [...assets.values()];
    }

    private async download(key: string): Promise<FinnhubSymbol[]> {
        const url: string = `${this.config.FINNHUB_BASE_URL}/stock/symbol?exchange=US`;
        const response: Response = await fetchSourceOk(url, { 'X-Finnhub-Token': key }, this.config.CATALOG_HTTP_TIMEOUT_MS);
        const parsed: z.SafeParseReturnType<unknown, FinnhubSymbol[]> = finnhubSymbolsSchema.safeParse(await readJson(response));
        if (!parsed.success) {
            throw new CatalogSourceError(SOURCE_ERROR_CODES.formatInvalid);
        }
        return parsed.data;
    }
}
