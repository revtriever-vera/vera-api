import { describe, expect, it, vi } from 'vitest';
import { MarketIndexDomain } from '../domain/market-index.domain';
import { MarketIndexSourcePort } from '../ports/market-index-source.port';
import { MarketIndexReaderService } from './market-index-reader.service';

function build(points: { date: string; close: string }[], configured: boolean) {
    const loadSince = vi.fn().mockResolvedValue(points);
    const service = new MarketIndexReaderService(
        { source: 'brapi', configured } as unknown as MarketIndexSourcePort,
        { loadSince } as unknown as MarketIndexDomain
    );
    return { service, loadSince };
}

describe('MarketIndexReaderService', () => {
    it('devolve os fechamentos guardados com a fonte', async () => {
        const { service, loadSince } = build([{ date: '2026-11-24', close: '166000' }], true);

        expect(await service.ibovespaSince('2023-11-01')).toEqual({
            state: 'ok',
            source: 'brapi',
            points: [{ date: '2026-11-24', close: '166000' }]
        });
        expect(loadSince).toHaveBeenCalledWith('^BVSP', '2023-11-01');
    });

    it('sem pontos e sem token diz que a fonte não está configurada', async () => {
        const { service } = build([], false);

        expect((await service.ibovespaSince('2023-11-01')).state).toBe('not_configured');
    });

    it('sem pontos e com token diz que ainda não há dados', async () => {
        const { service } = build([], true);

        expect((await service.ibovespaSince('2023-11-01')).state).toBe('no_data');
    });
});
