import { DiscoveryService } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { RecurringMarkPort } from './recurring-mark.port';
import { TransactionsLogService } from './transactions-log.service';
import { TransactionsRecurringService } from './transactions-recurring.service';

class FakePort extends RecurringMarkPort {
    public readonly confirmedTransactionIds: ReturnType<typeof vi.fn> = vi.fn();
}

function build(ports: readonly unknown[]): { service: TransactionsRecurringService; failed: ReturnType<typeof vi.fn> } {
    const failed: ReturnType<typeof vi.fn> = vi.fn();
    const service: TransactionsRecurringService = new TransactionsRecurringService(
        { getProviders: () => [{ instance: {} }, ...ports.map((instance: unknown) => ({ instance }))] } as unknown as DiscoveryService,
        { recurringMarkFailed: failed } as unknown as TransactionsLogService
    );
    return { service, failed };
}

describe('TransactionsRecurringService', () => {
    it('junta o que cada porta registrada marca e não pergunta nada para lista vazia', async () => {
        const first: FakePort = new FakePort();
        first.confirmedTransactionIds.mockResolvedValue(new Set<string>(['t1']));
        const second: FakePort = new FakePort();
        second.confirmedTransactionIds.mockResolvedValue(new Set<string>(['t3']));
        const { service } = build([first, second]);

        expect([...(await service.markedIn(['t1', 't2', 't3']))].sort()).toEqual(['t1', 't3']);
        expect((await service.markedIn([])).size).toBe(0);
        expect(first.confirmedTransactionIds).toHaveBeenCalledTimes(1);
    });

    it('porta que falha é registrada e a lista segue sem selo, sem derrubar a resposta', async () => {
        const broken: FakePort = new FakePort();
        broken.confirmedTransactionIds.mockRejectedValue(new TypeError('boom'));
        const { service, failed } = build([broken]);

        expect((await service.markedIn(['t1'])).size).toBe(0);
        expect(failed).toHaveBeenCalledWith('TypeError');
    });

    it('sem porta registrada ninguém é recorrente', async () => {
        expect((await build([]).service.markedIn(['t1'])).size).toBe(0);
    });
});
