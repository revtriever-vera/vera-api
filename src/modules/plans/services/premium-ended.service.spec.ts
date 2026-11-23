import { describe, expect, it, vi } from 'vitest';
import { PremiumEndedNotificationDomain } from '../domain/premium-ended-notification.domain';
import { PremiumEndedNotification } from '../domain/plans.types';
import { PlansLogService } from './plans-log.service';
import { PremiumEndedService } from './premium-ended.service';
import { PremiumLifecyclePort } from './premium-lifecycle.port';
import { PremiumLifecycleRegistry } from './premium-lifecycle.registry';

function notification(attempts: number, status: string = 'pending'): PremiumEndedNotification {
    return {
        id: 'n1',
        companyId: 'c1',
        handler: 'whatsapp',
        contractEndsAt: new Date(),
        status,
        attempts,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

function handler(onPremiumEnded: () => Promise<void>): PremiumLifecyclePort {
    return { name: 'whatsapp', onPremiumEnded };
}

function build(handlers: PremiumLifecyclePort[], existing: PremiumEndedNotification) {
    const domain = {
        record: vi.fn().mockResolvedValue(existing),
        markDone: vi.fn().mockResolvedValue(undefined),
        markFailed: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(existing),
        listOpenAcrossTenants: vi.fn().mockResolvedValue([existing])
    };
    const registry = {
        handlers: (): PremiumLifecyclePort[] => handlers,
        handlerNamed: (name: string): PremiumLifecyclePort | null => handlers.find((item) => item.name === name) ?? null
    };
    const publish = vi.fn().mockResolvedValue(undefined);
    const logs = { premiumEnded: vi.fn(), handlerFailed: vi.fn() };
    const service: PremiumEndedService = new PremiumEndedService(
        registry as unknown as PremiumLifecycleRegistry,
        domain as unknown as PremiumEndedNotificationDomain,
        { publish, remove: vi.fn() },
        logs as unknown as PlansLogService
    );
    return { service, domain, publish, logs };
}

describe('PremiumEndedService.notify', () => {
    it('marca como feito quando o implementador conclui', async () => {
        const { service, domain, publish } = build([handler(vi.fn().mockResolvedValue(undefined))], notification(0));

        await service.notify(new Date());

        expect(domain.markDone).toHaveBeenCalledWith('n1');
        expect(publish).not.toHaveBeenCalled();
    });

    it('registra a falha, agenda a repetição com jobId determinístico e segue', async () => {
        const second = vi.fn().mockResolvedValue(undefined);
        const failing: PremiumLifecyclePort = { name: 'calendar', onPremiumEnded: vi.fn().mockRejectedValue(new Error('x')) };
        const { service, domain, publish, logs } = build([failing, { name: 'whatsapp', onPremiumEnded: second }], notification(0));

        await service.notify(new Date());

        expect(domain.markFailed).toHaveBeenCalledTimes(1);
        expect(publish).toHaveBeenCalledWith(
            'vera-plans',
            'plans.premium-ended.retry.requested',
            { notificationId: 'n1' },
            expect.objectContaining({ jobId: 'premium-ended-n1-1' })
        );
        expect(second).toHaveBeenCalled();
        expect(logs.premiumEnded).toHaveBeenCalledWith(2, 1);
    });

    it('não agenda mais depois do limite de tentativas', async () => {
        const failing: PremiumLifecyclePort = { name: 'whatsapp', onPremiumEnded: vi.fn().mockRejectedValue(new Error('x')) };
        const { service, publish } = build([failing], notification(9));

        await service.notify(new Date());

        expect(publish).not.toHaveBeenCalled();
    });
});
