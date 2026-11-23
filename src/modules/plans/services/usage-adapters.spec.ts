import { describe, expect, it, vi } from 'vitest';
import { UsageContextHolder } from '../../../core/usage/ports/usage-context.holder';
import { PaidUsageMeter } from '../../../core/usage/services/paid-usage-meter.service';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { PaidUsageStateAdapter } from './paid-usage-state.adapter';
import { PlanLimitService } from './plan-limit.service';
import { PlanUsageContextAdapter } from './plan-usage-context.adapter';

describe('PlanUsageContextAdapter', () => {
    it('registra-se no holder, dá o teto do plano e o fuso da company', async () => {
        const register = vi.fn();
        const adapter: PlanUsageContextAdapter = new PlanUsageContextAdapter(
            { capMicros: vi.fn().mockResolvedValue(4_000_000) } as unknown as PlanLimitService,
            { timezoneOfCompany: vi.fn().mockResolvedValue('Asia/Tokyo') } as unknown as CompanyTimezoneService,
            { register, configuredCapMicros: () => 4_000_000 } as unknown as UsageContextHolder
        );

        adapter.onModuleInit();

        expect(register).toHaveBeenCalledWith(adapter);
        expect(await adapter.capMicros()).toBe(4_000_000);
        expect(await adapter.timezone()).toBe('Asia/Tokyo');
    });
});

describe('PaidUsageStateAdapter', () => {
    it('traduz o estado do medidor para o retrato do plans', async () => {
        const meter = {
            state: vi.fn().mockResolvedValue({
                period: '2026-10',
                capMicros: 4_000_000,
                usedMicros: 4_000_000,
                usedBps: 10000,
                byFeature: { ai: 7000, whatsapp: 3000 },
                state: 'paused',
                resetsAt: '2026-11-01T03:00:00.000Z'
            })
        };

        expect(await new PaidUsageStateAdapter(meter as unknown as PaidUsageMeter).state()).toEqual({
            usedBps: 10000,
            state: 'paused',
            resetsAt: '2026-11-01T03:00:00.000Z',
            byFeature: { ai: { usedBps: 7000 }, whatsapp: { usedBps: 3000 } }
        });
    });
});
