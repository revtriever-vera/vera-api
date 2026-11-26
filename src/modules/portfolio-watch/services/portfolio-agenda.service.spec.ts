import { describe, expect, it, vi } from 'vitest';
import { ANY_HOLDER } from '../../../shared/holder/holder-filter';
import { AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { MaturitiesReaderService } from '../../fixed-income-schedule/services/maturities-reader.service';
import { PortfolioEventsReaderService } from '../../portfolio-events/services/portfolio-events-reader.service';
import { PositionReaderService } from '../../positions/services/position-reader.service';
import { PortfolioAgendaService } from './portfolio-agenda.service';

const WINDOW = { from: '2026-12-01', to: '2026-12-31' };

function position(assetId: string, quantity: string, isSample: boolean = false) {
    return { assetId, quantity, isSample };
}

function maturity(id: string, maturityDate: string, isSample: boolean = false) {
    return { holdingKind: 'fixed_income', id, name: `CDB ${id}`, maturityDate, estimatedValueMinor: 1_000_000, currency: 'BRL', isSample };
}

function build(positions: unknown[], events: unknown[], maturities: unknown[]) {
    const forAssets = vi.fn().mockResolvedValue(events);
    const readAll = vi.fn().mockResolvedValue({ asOf: '2026-12-01', items: maturities });
    const service = new PortfolioAgendaService(
        { listForCompany: vi.fn().mockResolvedValue(positions) } as unknown as PositionReaderService,
        { findManyByIds: vi.fn().mockResolvedValue([{ id: 'a1', symbol: 'XPLG11' }]) } as unknown as AssetCatalogService,
        { forAssets } as unknown as PortfolioEventsReaderService,
        { readAll } as unknown as MaturitiesReaderService
    );
    return { service, forAssets, readAll };
}

function event(id: string, exDate: string) {
    return {
        id,
        assetId: 'a1',
        kind: 'fii_income',
        exDate,
        paymentDate: null,
        eventDate: null,
        amountPerUnit: '0.78',
        currency: 'BRL',
        documentUrl: null
    };
}

describe('PortfolioAgendaService', () => {
    it('junta eventos dos ativos em carteira e vencimentos, do mais cedo para o mais tarde, com o valor para a conta', async () => {
        const { service, forAssets } = build(
            [position('a1', '60'), position('a1', '40'), position('a2', '5', true)],
            [event('e1', '2026-12-20')],
            [maturity('m1', '2026-12-10'), maturity('m2', '2027-01-10'), maturity('m3', '2026-12-11', true)]
        );

        const items = await service.build(WINDOW, ANY_HOLDER);

        expect(forAssets).toHaveBeenCalledWith(['a1'], WINDOW);
        expect(items.map((item) => item.id)).toEqual(['m1', 'e1']);
        expect(items[1]).toMatchObject({ name: 'XPLG11', amountForAccountMinor: 7800, estimated: true });
        expect(items[0]).toMatchObject({ kind: 'fixed_income_maturity', amountForAccountMinor: 1_000_000, holdingId: 'm1' });
    });

    it('sem posição real não consulta eventos e a posição zerada não conta', async () => {
        const { service, forAssets } = build([position('a1', '0')], [], []);

        expect(await service.build(WINDOW, ANY_HOLDER)).toEqual([]);
        expect(forAssets).not.toHaveBeenCalled();
    });

    it('repassa o titular aos vencimentos', async () => {
        const { service, readAll } = build([], [], []);
        const holder = { kind: 'person', userId: 'u1' } as const;

        await service.build(WINDOW, holder);

        expect(readAll).toHaveBeenCalledWith(holder);
    });
});
