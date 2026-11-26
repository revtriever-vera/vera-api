import { describe, expect, it, vi } from 'vitest';
import { SourceAsset } from '../ports/asset-source.port';
import { AssetSourceRegistryService } from './asset-source-registry.service';
import { IssuerLinkSourceService } from './issuer-link-source.service';

const asset = (symbol: string, kind: SourceAsset['kind'], raw: Record<string, string>): SourceAsset => ({
    externalId: symbol,
    symbol,
    name: symbol,
    kind,
    currency: 'BRL',
    raw
});

function serviceWith(assets: SourceAsset[] | null): IssuerLinkSourceService {
    const port = assets === null ? null : { fetchAll: vi.fn().mockResolvedValue(assets) };
    return new IssuerLinkSourceService({ portFor: () => port } as unknown as AssetSourceRegistryService);
}

describe('IssuerLinkSourceService.listB3Issuers', () => {
    it('exposes the CNPJ the official registries gave for companies and real estate funds only', async () => {
        const links = await serviceWith([
            asset('ITUB4', 'stock', { cnpj: '60872504000123' }),
            asset('HGLG11', 'fii', { cnpj: '11728688000147', isin: 'BRHGLGCTF004' }),
            asset('BOVA11', 'etf', { cnpj: '10406511000161' }),
            asset('AAPL34', 'bdr', { cnpj: '1' }),
            asset('XXXX3', 'stock', { isin: 'x' })
        ]).listB3Issuers();

        expect(links).toEqual([
            { market: 'B3', symbol: 'ITUB4', cnpj: '60872504000123', cvmCode: null, isFund: false, origin: 'cvm_fca' },
            { market: 'B3', symbol: 'HGLG11', cnpj: '11728688000147', cvmCode: null, isFund: true, origin: 'cvm_inf_mensal_fii' }
        ]);
    });

    it('returns nothing when the B3 source is not available', async () => {
        expect(await serviceWith(null).listB3Issuers()).toEqual([]);
    });
});
