import { describe, expect, it, vi } from 'vitest';
import { QueueEnvelope } from '../../../../core/queue/queue.types';
import { SyncFanoutApplication } from '../../application/sync-fanout.application';
import { SyncDailyCommand, SyncDailyTickHandler } from './sync-daily.command';

describe('SyncDailyCommand', () => {
    it('declara o cron das 07:00 na fila de conexões com a chave compartilhada', () => {
        const command: SyncDailyCommand = new SyncDailyCommand();

        expect(command.key).toBe('bank-connections-sync-daily-command');
        expect(command.queue).toBe('vera-bank-connections');
        expect(command.type).toBe('bank-connections.sync.daily.requested');
        expect(command.pattern).toBe('0 7 * * *');
        expect(command.payload).toEqual({});
    });

    it('o tick dispara o fan-out', async () => {
        const handleTick: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(3);
        const handler: SyncDailyTickHandler = new SyncDailyTickHandler({ handleTick } as unknown as SyncFanoutApplication);

        await handler.handle({} as QueueEnvelope);

        expect(handleTick).toHaveBeenCalledOnce();
        expect(handler.type).toBe('bank-connections.sync.daily.requested');
        expect(handler.queue).toBe('vera-bank-connections');
    });
});
