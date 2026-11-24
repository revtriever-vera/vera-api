import { Injectable } from '@nestjs/common';
import { profileOf } from '../domain/asset-profiles';
import { AssetDomain } from '../domain/asset.domain';
import { AssetNotFoundError } from '../domain/catalog.errors';
import { escapeLike } from '../../../shared/utils/like.util';
import { Asset, AssetSearchCriteria, SEARCH_MAX_LIMIT } from '../domain/catalog.types';
import { CatalogLogService } from '../services/catalog-log.service';
import { AssetItem, AssetSearchQuery, AssetSearchResponse } from '../validation/catalog.schemas';

const CNPJ_TEXT: RegExp = /^[\d./-]+$/;
const CNPJ_MIN_BARE_DIGITS: number = 8;

export function searchTextOf(raw: string): string {
    const text: string = raw.trim().toLowerCase();
    if (!CNPJ_TEXT.test(text)) {
        return text;
    }
    const digits: string = text.replaceAll(/\D/g, '');
    const isCnpj: boolean = digits !== '' && (digits.length >= CNPJ_MIN_BARE_DIGITS || /[./-]/.test(text));
    return isCnpj ? digits : text;
}

export function toAssetItem(asset: Asset): AssetItem {
    const profile: ReturnType<typeof profileOf> = profileOf(asset.market, asset.symbol);
    return {
        id: asset.id,
        symbol: asset.symbol,
        name: asset.name,
        market: asset.market as AssetItem['market'],
        kind: asset.kind as AssetItem['kind'],
        typeGroup: asset.typeGroup as AssetItem['typeGroup'],
        currency: asset.currency as AssetItem['currency'],
        suggestedClassKey: asset.suggestedClassKey,
        dollarExposure: asset.dollarExposure,
        quantityDecimals: asset.quantityDecimals,
        maturityDate: asset.maturityDate,
        sector: profile.sector,
        issuerGroupId: profile.issuerGroupId
    };
}

@Injectable()
export class AssetSearchApplication {
    public constructor(
        private readonly assets: AssetDomain,
        private readonly logs: CatalogLogService
    ) {}

    public async search(query: AssetSearchQuery): Promise<AssetSearchResponse> {
        const text: string = searchTextOf(query.q ?? '');
        const criteria: AssetSearchCriteria = {
            group: query.group,
            text,
            likeText: escapeLike(text),
            limit: Math.min(query.limit, SEARCH_MAX_LIMIT)
        };
        try {
            const found: Asset[] = await this.assets.search(criteria);
            return { data: found.map(toAssetItem) };
        } catch (error: unknown) {
            this.logs.searchFailed(error);
            throw error;
        }
    }

    public async findById(id: string): Promise<AssetItem> {
        const asset: Asset | null = await this.assets.findById(id);
        if (asset === null) {
            throw new AssetNotFoundError(id);
        }
        return toAssetItem(asset);
    }
}
