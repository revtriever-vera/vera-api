import { describe, expect, it, vi } from 'vitest';
import { QueueEnvelope } from '../../../../core/queue/queue.types';
import { IndexSyncApplication } from '../../application/index-sync.application';
import { IndexSyncCommand } from '../commands/index-sync.command';
import { IndexSyncSeriesHandler } from './index-sync-series.handler';
import { IndexSyncTickHandler } from './index-sync-tick.handler';

function envelope(payload: unknown): QueueEnvelope {
    return { type: 'x', requestId: 'r', companyId: null, occurredAt: new Date().toISOString(), trace: {}, payload };
}

describe('fixed income queue entry points', () => {
    it('o comando diário aponta para a fila e o tipo do tick, às 09:30', () => {
        const command = new IndexSyncCommand();

        expect(command.key).toBe('fixed-income-index-sync-command');
        expect(command.queue).toBe('vera-fixed-income');
        expect(command.type).toBe('fixed-income.index-sync.requested');
        expect(command.pattern).toBe('30 9 * * *');
    });

    it('o tick pede a sincronização', async () => {
        const requestSync = vi.fn().mockResolvedValue(undefined);

        await new IndexSyncTickHandler({ requestSync } as unknown as IndexSyncApplication).handle(envelope({}));

        expect(requestSync).toHaveBeenCalledTimes(1);
    });

    it('o job de série valida o payload e sincroniza a janela', async () => {
        const syncWindow = vi.fn().mockResolvedValue(3);
        const handler = new IndexSyncSeriesHandler({ syncWindow } as unknown as IndexSyncApplication);

        await handler.handle(envelope({ series: 'ipca_monthly', from: '2026-01-01', to: '2026-10-11' }));
        await expect(handler.handle(envelope({ series: 'selic', from: '2026-01-01', to: '2026-10-11' }))).rejects.toThrow();

        expect(syncWindow).toHaveBeenCalledTimes(1);
        expect(syncWindow).toHaveBeenCalledWith({ series: 'ipca_monthly', from: '2026-01-01', to: '2026-10-11' });
    });
});
