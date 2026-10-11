import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { catalogConfig } from '../config/catalog.config';
import { CatalogSourceError } from '../domain/catalog.errors';
import { ASSET_KINDS, AssetKind, CATALOG_SOURCES, CatalogSource, SOURCE_ERROR_CODES } from '../domain/catalog.types';
import { AssetSourcePort, SourceAsset } from '../ports/asset-source.port';
import { cell, columnIndexes, linesOf } from './line-stream';
import { fetchSource, sourceErrorOfStatus } from './source-fetch';

const REQUIRED_COLUMNS: readonly string[] = ['TckrSymb', 'AsstDesc', 'SctyCtgyNm', 'MktNm'];
const CASH_MARKET: string = 'EQUITY-CASH';
const HEADER_MARKER: string = 'TckrSymb';
const LOOKBACK_DAYS: number = 5;
const DAY_MS: number = 86_400_000;
const HTTP_NOT_FOUND: number = 404;

const KIND_BY_CATEGORY: Readonly<Record<string, AssetKind>> = {
    SHARES: ASSET_KINDS.stock,
    UNIT: ASSET_KINDS.stock,
    BDR: ASSET_KINDS.bdr,
    FUNDS: ASSET_KINDS.fii
};

export function kindOfCategory(category: string): AssetKind | null {
    const key: string = category.trim().toUpperCase();
    if (key.startsWith('ETF')) {
        return ASSET_KINDS.etf;
    }
    return KIND_BY_CATEGORY[key] ?? null;
}

function isoDay(at: Date): string {
    return at.toISOString().slice(0, 10);
}

@Injectable()
export class B3InstrumentsDriver extends AssetSourcePort {
    public readonly source: CatalogSource = CATALOG_SOURCES.b3;

    public constructor(@Inject(catalogConfig.KEY) private readonly config: ConfigType<typeof catalogConfig>) {
        super();
    }

    public async fetchAll(): Promise<readonly SourceAsset[]> {
        const template: string | undefined = this.config.B3_INSTRUMENTS_URL;
        if (template === undefined) {
            throw new CatalogSourceError(SOURCE_ERROR_CODES.rejected);
        }
        const response: Response = await this.download(template);
        return this.parse(response);
    }

    private async download(template: string): Promise<Response> {
        const now: number = Date.now();
        for (let back: number = 0; back <= LOOKBACK_DAYS; back += 1) {
            const url: string = template.replace('{date}', isoDay(new Date(now - back * DAY_MS)));
            const response: Response = await fetchSource(url, {}, this.config.CATALOG_HTTP_TIMEOUT_MS);
            if (response.ok) {
                return response;
            }
            if (response.status !== HTTP_NOT_FOUND || !template.includes('{date}')) {
                throw sourceErrorOfStatus(response.status);
            }
        }
        throw new CatalogSourceError(SOURCE_ERROR_CODES.rejected);
    }

    private async parse(response: Response): Promise<readonly SourceAsset[]> {
        const assets: Map<string, SourceAsset> = new Map<string, SourceAsset>();
        let indexes: ReadonlyMap<string, number> | null = null;
        for await (const line of linesOf(response, 'windows-1252')) {
            if (indexes === null) {
                indexes = line.includes(HEADER_MARKER) ? columnIndexes(line, REQUIRED_COLUMNS) : null;
                continue;
            }
            const asset: SourceAsset | null = this.assetOf(line.split(';'), indexes);
            if (asset !== null) {
                assets.set(asset.externalId, asset);
            }
        }
        if (indexes === null) {
            throw new CatalogSourceError(SOURCE_ERROR_CODES.formatInvalid);
        }
        return [...assets.values()];
    }

    private assetOf(columns: readonly string[], indexes: ReadonlyMap<string, number>): SourceAsset | null {
        const ticker: string = cell(columns, indexes, 'TckrSymb').toUpperCase();
        const category: string = cell(columns, indexes, 'SctyCtgyNm');
        const kind: AssetKind | null = kindOfCategory(category);
        if (ticker === '' || kind === null || cell(columns, indexes, 'MktNm').toUpperCase() !== CASH_MARKET) {
            return null;
        }
        return {
            externalId: ticker,
            symbol: ticker,
            name: cell(columns, indexes, 'AsstDesc') || ticker,
            kind,
            currency: 'BRL',
            raw: { category }
        };
    }
}
