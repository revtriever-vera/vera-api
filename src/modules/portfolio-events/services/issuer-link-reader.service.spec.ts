import { describe, expect, it, vi } from 'vitest';
import { AssetIssuerLinkDomain } from '../domain/asset-issuer-link.domain';
import { IssuerLink } from '../domain/portfolio-events.types';
import { IssuerLinkReaderService } from './issuer-link-reader.service';

describe('IssuerLinkReaderService', () => {
    it('reads the issuer links of the given assets through the domain', async () => {
        const link: IssuerLink = { assetId: 'asset-1', issuerKind: 'company', cnpj: '01083200000118', assetClass: 'ON' };
        const findByAssetIds: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([link]);
        const service: IssuerLinkReaderService = new IssuerLinkReaderService({ findByAssetIds } as unknown as AssetIssuerLinkDomain);

        await expect(service.forAssets(['asset-1'])).resolves.toEqual([link]);
        expect(findByAssetIds).toHaveBeenCalledWith(['asset-1']);
    });
});
