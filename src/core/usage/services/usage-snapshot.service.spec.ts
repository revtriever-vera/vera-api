import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../context/app-context.port';
import { UsageConfig } from '../config/usage.config';
import { PaidUsageEntryDomain } from '../domain/paid-usage-entry.domain';
import { UsageContextHolder } from '../ports/usage-context.holder';
import { UsageSnapshotService } from './usage-snapshot.service';

const CONFIG: UsageConfig = {
    PAID_USAGE_CAP_MICROS: 4_000_000,
    PAID_USAGE_MIN_ROOM_MICROS: 20_000,
    PAID_USAGE_WARNING_BPS: 8000,
    USAGE_USD_BRL_FALLBACK: '5',
    WHATSAPP_PRICE_TABLE: {},
    PAID_SEND_COST_MULTIPLIER: 1
};

function build(companyId: string | null = 'company-1') {
    const totalsByFeature = vi.fn().mockResolvedValue({ ai: 1_000_000, whatsapp: 0 });
    const service: UsageSnapshotService = new UsageSnapshotService(
        CONFIG,
        { totalsByFeature } as unknown as PaidUsageEntryDomain,
        {
            timezone: vi.fn().mockResolvedValue('America/Sao_Paulo'),
            capMicros: vi.fn().mockResolvedValue(4_000_000)
        } as unknown as UsageContextHolder,
        { getOrNull: vi.fn().mockReturnValue(companyId === null ? null : { requestId: 'r', companyId }) } as unknown as AppContext
    );
    return { service, totalsByFeature };
}

describe('UsageSnapshotService', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-15T12:00:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('monta o estado do período corrente', async () => {
        expect(await build().service.state()).toMatchObject({
            period: '2026-10',
            usedBps: 2500,
            state: 'ok',
            resetsAt: '2026-11-01T03:00:00.000Z'
        });
    });

    it('cacheia por 30 s e invalida a pedido', async () => {
        const { service, totalsByFeature } = build();

        await service.state();
        await service.state();
        expect(totalsByFeature).toHaveBeenCalledTimes(1);

        vi.setSystemTime(new Date('2026-10-15T12:00:31.000Z'));
        await service.state();
        expect(totalsByFeature).toHaveBeenCalledTimes(2);

        service.invalidate();
        await service.state();
        expect(totalsByFeature).toHaveBeenCalledTimes(3);
    });

    it('o mês novo não reaproveita o cache do anterior', async () => {
        const { service, totalsByFeature } = build();

        await service.state();
        vi.setSystemTime(new Date('2026-11-01T03:00:00.000Z'));
        const next = await service.state();

        expect(next.period).toBe('2026-11');
        expect(totalsByFeature).toHaveBeenCalledTimes(2);
    });

    it('sem tenant no contexto falha alto', async () => {
        await expect(build(null).service.state()).rejects.toMatchObject({ code: 'core.missing_tenant_context' });
    });
});
