import { describe, expect, it, vi } from 'vitest';
import { AssetIssuerLinksRepository } from '../repositories/asset-issuer-links.repository';
import { PortfolioEventsRepository } from '../repositories/portfolio-events.repository';
import { AssetIssuerLinkDomain } from './asset-issuer-link.domain';
import { PortfolioEventDomain } from './portfolio-event.domain';
import { PortfolioEventWrite } from './portfolio-events.types';

const event = (amountPerUnit: string): PortfolioEventWrite => ({
    assetId: 'a',
    source: 'fnet',
    kind: 'fii_income',
    exDate: '2026-10-30',
    paymentDate: null,
    eventDate: null,
    amountPerUnit,
    currency: 'BRL',
    externalKey: 'k',
    documentUrl: null
});

describe('AssetIssuerLinkDomain.saveMany', () => {
    it('links only with an official 14-digit CNPJ', async () => {
        const upsertMany: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
        const domain: AssetIssuerLinkDomain = new AssetIssuerLinkDomain({ upsertMany } as unknown as AssetIssuerLinksRepository);

        const saved: number = await domain.saveMany([
            { assetId: 'a', issuerKind: 'fund', cnpj: '11728688000147', cvmCode: null, source: 'cvm_inf_mensal_fii' },
            { assetId: 'b', issuerKind: 'company', cnpj: '', cvmCode: null, source: 'cvm_fca' },
            { assetId: 'c', issuerKind: 'company', cnpj: '123', cvmCode: null, source: 'cvm_fca' }
        ]);

        expect(saved).toBe(1);
        expect(upsertMany).toHaveBeenCalledWith([expect.objectContaining({ assetId: 'a' })]);
    });
});

describe('PortfolioEventDomain', () => {
    it('keeps one event per source and key before the upsert, the last one winning', async () => {
        const upsertMany: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
        const domain: PortfolioEventDomain = new PortfolioEventDomain({ upsertMany } as unknown as PortfolioEventsRepository);

        const saved: number = await domain.saveMany([event('1.00'), event('1.20')]);

        expect(saved).toBe(1);
        expect(upsertMany).toHaveBeenCalledWith([event('1.20')]);
    });

    it('reads by assets and window', async () => {
        const findInWindow: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([]);

        await new PortfolioEventDomain({ findInWindow } as unknown as PortfolioEventsRepository).findForAssets(['a'], {
            from: '2026-01-01',
            to: '2026-12-31'
        });

        expect(findInWindow).toHaveBeenCalledWith(['a'], { from: '2026-01-01', to: '2026-12-31' });
    });
});
