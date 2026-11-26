import { describe, expect, it, vi } from 'vitest';
import { Asset, AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { IssuerLinkSource, IssuerLinkSourceService } from '../../catalog/services/issuer-link-source.service';
import { AssetIssuerLinkDomain } from '../domain/asset-issuer-link.domain';
import { PortfolioEventsLogService } from '../services/portfolio-events-log.service';
import { IssuerLinksApplication } from './issuer-links.application';

const source = (symbol: string, isFund: boolean): IssuerLinkSource => ({
    market: 'B3',
    symbol,
    cnpj: '11728688000147',
    cvmCode: null,
    isFund,
    origin: isFund ? 'cvm_inf_mensal_fii' : 'cvm_fca'
});

describe('IssuerLinksApplication.refresh', () => {
    it('links the cataloged assets to the official issuer and skips tickers the catalog does not have', async () => {
        const saveMany: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(2);
        const findMany: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([
            { id: 'asset-1', externalId: 'HGLG11' },
            { id: 'asset-2', externalId: 'ITUB4' }
        ] as Asset[]);
        const application: IssuerLinksApplication = new IssuerLinksApplication(
            {
                listB3Issuers: vi.fn().mockResolvedValue([source('HGLG11', true), source('ITUB4', false), source('ZZZZ11', true)])
            } as unknown as IssuerLinkSourceService,
            { findManyByMarketAndExternalIds: findMany } as unknown as AssetCatalogService,
            { saveMany } as unknown as AssetIssuerLinkDomain,
            { linksRefreshed: vi.fn() } as unknown as PortfolioEventsLogService
        );

        expect(await application.refresh()).toBe(2);

        expect(findMany).toHaveBeenCalledWith('B3', ['HGLG11', 'ITUB4', 'ZZZZ11']);
        expect(saveMany).toHaveBeenCalledWith([
            { assetId: 'asset-1', issuerKind: 'fund', cnpj: '11728688000147', cvmCode: null, source: 'cvm_inf_mensal_fii' },
            { assetId: 'asset-2', issuerKind: 'company', cnpj: '11728688000147', cvmCode: null, source: 'cvm_fca' }
        ]);
    });
});
