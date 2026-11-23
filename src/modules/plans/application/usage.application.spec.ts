import { describe, expect, it, vi } from 'vitest';
import { ContextHolder } from '../../../core/context/as-company.decorator';
import { AppContext } from '../../../core/context/app-context.port';
import { PaidUsageHistoryService } from '../../../core/usage/services/paid-usage-history.service';
import { PaidUsageMeter } from '../../../core/usage/services/paid-usage-meter.service';
import { UsageCompaniesGaugeService } from '../../../core/usage/services/usage-companies-gauge.service';
import { PlanGateService } from '../services/plan-gate.service';
import { UsageNotifier } from '../services/usage-notifier.service';
import { UsageApplication } from './usage.application';

const STATE = {
    period: '2026-10',
    capMicros: 4_000_000,
    usedMicros: 3_400_000,
    usedBps: 8500,
    byFeature: { ai: 6000, whatsapp: 2500 },
    state: 'warning',
    resetsAt: '2026-11-01T03:00:00.000Z'
};

function build(mode: 'hosted' | 'self_hosted') {
    const notify = vi.fn().mockResolvedValue(1);
    const purgeExpired = vi.fn().mockResolvedValue(4);
    const publish = vi.fn().mockResolvedValue(undefined);
    const application: UsageApplication = new UsageApplication(
        { state: vi.fn().mockResolvedValue(STATE) } as unknown as PaidUsageMeter,
        { purgeExpired } as unknown as PaidUsageHistoryService,
        { publish } as unknown as UsageCompaniesGaugeService,
        { mode: vi.fn().mockReturnValue(mode) } as unknown as PlanGateService,
        { notify } as unknown as UsageNotifier
    );
    return { application, notify, purgeExpired, publish };
}

describe('UsageApplication', () => {
    it('lê a cota em bps e esconde o valor absoluto no hosted', async () => {
        expect(await build('hosted').application.read()).toEqual({
            period: '2026-10',
            state: 'warning',
            usedBps: 8500,
            resetsAt: '2026-11-01T03:00:00.000Z',
            byFeature: { ai: { usedBps: 6000 }, whatsapp: { usedBps: 2500 } },
            capMicros: null
        });
    });

    it('mostra o teto só no self_hosted', async () => {
        expect((await build('self_hosted').application.read()).capMicros).toBe(4_000_000);
    });

    it('envia o aviso na company do job', async () => {
        const context = {
            get: vi.fn().mockReturnValue({ requestId: 'r' }),
            run: vi.fn(async (_data: unknown, fn: () => Promise<unknown>) => fn())
        };
        ContextHolder.set(context as unknown as AppContext);
        const { application, notify } = build('hosted');

        await application.sendNotice('company-1', { period: '2026-10', kind: 'warning', usedBps: 8500 });

        expect(context.run).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'company-1' }), expect.any(Function));
        expect(notify).toHaveBeenCalledWith({ companyId: 'company-1', period: '2026-10', kind: 'warning', usedBps: 8500 });
    });

    it('delega a limpeza e o gauge', async () => {
        const { application, purgeExpired, publish } = build('hosted');

        expect(await application.purgeExpired()).toBe(4);
        await application.publishGauge();

        expect(purgeExpired).toHaveBeenCalled();
        expect(publish).toHaveBeenCalled();
    });
});
