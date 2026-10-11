import { describe, expect, it, vi } from 'vitest';
import { AssetDomain } from '../domain/asset.domain';
import { Asset } from '../domain/catalog.types';
import { CatalogLogService } from '../services/catalog-log.service';
import { AssetSearchApplication, escapeLike, toAssetItem } from './asset-search.application';

const ASSET: Asset = {
    id: '0199c3a0-7b1e-7c2a-9d4e-2f6a8b1c3d5e',
    market: 'B3',
    externalId: 'IVVB11',
    symbol: 'IVVB11',
    name: 'iShares S&P 500',
    kind: 'etf',
    typeGroup: 'acoes_eua',
    suggestedClassKey: 'acoes_eua',
    dollarExposure: true,
    currency: 'BRL',
    quotesProvider: 'brapi',
    quantityDecimals: 0,
    maturityDate: null,
    popularRank: 1,
    rank: null,
    status: 'active',
    sourceHash: 'hash',
    seenAt: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0)
};

function rig(
    search: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([ASSET]),
    findById: ReturnType<typeof vi.fn> = vi.fn()
): {
    application: AssetSearchApplication;
    search: ReturnType<typeof vi.fn>;
    searchFailed: ReturnType<typeof vi.fn>;
} {
    const searchFailed: ReturnType<typeof vi.fn> = vi.fn();
    const application: AssetSearchApplication = new AssetSearchApplication(
        { search, findById } as unknown as AssetDomain,
        { searchFailed } as unknown as CatalogLogService
    );
    return { application, search, searchFailed };
}

describe('AssetSearchApplication', () => {
    it('normalizes the text and passes the group and limit', async () => {
        const { application, search } = rig();

        await application.search({ q: '  ItUb ', group: 'acoes_br', limit: 10 });

        expect(search).toHaveBeenCalledWith({ group: 'acoes_br', text: 'itub', likeText: 'itub', limit: 10 });
    });

    it('treats a missing q as an empty text', async () => {
        const { application, search } = rig();

        await application.search({ limit: 20 });

        expect(search).toHaveBeenCalledWith({ group: undefined, text: '', likeText: '', limit: 20 });
    });

    it('never asks for more than 30 results', async () => {
        const { application, search } = rig();

        await application.search({ q: 'a', limit: 500 });

        expect(search.mock.calls[0]?.[0]).toMatchObject({ limit: 30 });
    });

    it('escapes LIKE wildcards in the text', async () => {
        const { application, search } = rig();

        await application.search({ q: '100%_a\\b', limit: 20 });

        expect(search.mock.calls[0]?.[0]).toMatchObject({ text: '100%_a\\b', likeText: '100\\%\\_a\\\\b' });
        expect(escapeLike('%_')).toBe('\\%\\_');
    });

    it('serializes the public fields only', async () => {
        const { application } = rig();

        const response = await application.search({ q: 'ivvb', limit: 20 });

        expect(response).toEqual({
            data: [
                {
                    id: ASSET.id,
                    symbol: 'IVVB11',
                    name: 'iShares S&P 500',
                    market: 'B3',
                    kind: 'etf',
                    typeGroup: 'acoes_eua',
                    currency: 'BRL',
                    suggestedClassKey: 'acoes_eua',
                    dollarExposure: true,
                    quantityDecimals: 0,
                    maturityDate: null
                }
            ]
        });
        expect(toAssetItem(ASSET)).not.toHaveProperty('sourceHash');
    });

    it('logs and rethrows a failed search', async () => {
        const boom: Error = new Error('db down');
        const { application, searchFailed } = rig(vi.fn().mockRejectedValue(boom));

        await expect(application.search({ q: 'a', limit: 20 })).rejects.toBe(boom);

        expect(searchFailed).toHaveBeenCalledWith(boom);
    });

    it('finds an asset by id and throws catalog.asset_not_found when it does not exist', async () => {
        const found = rig(vi.fn(), vi.fn().mockResolvedValue(ASSET));
        const missing = rig(vi.fn(), vi.fn().mockResolvedValue(null));

        expect((await found.application.findById(ASSET.id)).symbol).toBe('IVVB11');
        await expect(missing.application.findById('0199c3a0-0000-7000-8000-000000000000')).rejects.toMatchObject({
            code: 'catalog.asset_not_found',
            status: 404,
            meta: { assetId: '0199c3a0-0000-7000-8000-000000000000' }
        });
    });
});
