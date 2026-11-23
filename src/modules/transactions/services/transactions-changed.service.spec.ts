import { DiscoveryService } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { RecurringRefreshPort } from './recurring-refresh.port';
import { TransactionsChangedService } from './transactions-changed.service';
import { TransactionsLogService } from './transactions-log.service';

class FakePort extends RecurringRefreshPort {
    public readonly refresh: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
}

function build(
    companyId: string | undefined,
    ports: readonly unknown[]
): { service: TransactionsChangedService; failed: ReturnType<typeof vi.fn> } {
    const failed: ReturnType<typeof vi.fn> = vi.fn();
    const service: TransactionsChangedService = new TransactionsChangedService(
        { getProviders: () => [{ instance: {} }, ...ports.map((instance: unknown) => ({ instance }))] } as unknown as DiscoveryService,
        { getOrNull: () => (companyId === undefined ? null : { companyId }) } as unknown as AppContext,
        { changeNotificationFailed: failed } as unknown as TransactionsLogService
    );
    return { service, failed };
}

describe('TransactionsChangedService', () => {
    it('avisa cada porta registrada com a company do contexto', async () => {
        const first: FakePort = new FakePort();
        const second: FakePort = new FakePort();
        const { service } = build('c1', [first, second]);

        await service.notify();

        expect(first.refresh).toHaveBeenCalledWith('c1');
        expect(second.refresh).toHaveBeenCalledWith('c1');
    });

    it('sem porta registrada ou sem company no contexto não faz nada', async () => {
        const port: FakePort = new FakePort();

        await expect(build('c1', []).service.notify()).resolves.toBeUndefined();
        await build(undefined, [port]).service.notify();

        expect(port.refresh).not.toHaveBeenCalled();
    });

    it('a falha de uma porta é registrada e não derruba quem avisou nem as outras portas', async () => {
        const broken: FakePort = new FakePort();
        broken.refresh.mockRejectedValue(new TypeError('redis down'));
        const healthy: FakePort = new FakePort();
        const { service, failed } = build('c1', [broken, healthy]);

        await expect(service.notify()).resolves.toBeUndefined();

        expect(failed).toHaveBeenCalledWith('TypeError');
        expect(healthy.refresh).toHaveBeenCalledWith('c1');
    });
});
