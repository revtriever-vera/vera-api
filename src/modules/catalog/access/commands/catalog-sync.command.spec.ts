import { describe, expect, it, vi } from 'vitest';
import { QueueEnvelope } from '../../../../core/queue/queue.types';
import { CatalogSyncApplication } from '../../application/catalog-sync.application';
import { CatalogSyncSourceHandler } from '../queue/catalog-sync-source.handler';
import { CatalogSyncTesouroDailyCommand, CatalogSyncTickHandler, CatalogSyncWeeklyCommand } from './catalog-sync.command';

function envelope(type: string, payload: unknown): QueueEnvelope {
    return { type, requestId: 'req', companyId: null, occurredAt: new Date(0).toISOString(), trace: {}, payload };
}

describe('catalog commands', () => {
    it('schedules the weekly sync on Mondays at 06:00 and the Tesouro sync every day at 06:00', () => {
        const weekly: CatalogSyncWeeklyCommand = new CatalogSyncWeeklyCommand();
        const daily: CatalogSyncTesouroDailyCommand = new CatalogSyncTesouroDailyCommand();

        expect([weekly.key, weekly.queue, weekly.type, weekly.pattern, weekly.payload]).toEqual([
            'catalog-sync-weekly-command',
            'vera-catalog',
            'catalog.sync.tick.requested',
            '0 6 * * 1',
            { cadence: 'weekly' }
        ]);
        expect([daily.key, daily.pattern, daily.payload]).toEqual([
            'catalog-sync-tesouro-daily-command',
            '0 6 * * *',
            { cadence: 'tesouro_daily' }
        ]);
    });

    it('hands the tick payload to the application', async () => {
        const handleTick: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
        const handler: CatalogSyncTickHandler = new CatalogSyncTickHandler({ handleTick } as unknown as CatalogSyncApplication);

        await handler.handle(envelope('catalog.sync.tick.requested', { cadence: 'weekly' }));

        expect(handler.queue).toBe('vera-catalog');
        expect(handleTick).toHaveBeenCalledWith({ cadence: 'weekly' });
    });

    it('hands the source payload to the application', async () => {
        const handleSource: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
        const handler: CatalogSyncSourceHandler = new CatalogSyncSourceHandler({ handleSource } as unknown as CatalogSyncApplication);

        await handler.handle(envelope('catalog.sync.source.requested', { source: 'b3' }));

        expect(handler.type).toBe('catalog.sync.source.requested');
        expect(handleSource).toHaveBeenCalledWith({ source: 'b3' });
    });
});
