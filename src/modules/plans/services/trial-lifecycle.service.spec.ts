import { describe, expect, it, vi } from 'vitest';
import { PlanCatalogDomain } from '../domain/plan-catalog.domain';
import { PlanDomain } from '../domain/plan.domain';
import { CompanyProduct } from '../domain/plans.types';
import { PlanContractService } from './plan-contract.service';
import { PlansLogService } from './plans-log.service';
import { TrialLifecycleService } from './trial-lifecycle.service';
import { TrialNotifier } from './trial-notifier.service';

const NOW: Date = new Date('2026-11-20T12:00:00Z');
const DAY_MS: number = 24 * 60 * 60 * 1000;

function trialLine(overrides: Partial<CompanyProduct> = {}): CompanyProduct {
    return {
        id: 'l1',
        companyId: 'c1',
        productId: 'p1',
        priceCents: '0',
        startsAt: new Date('2026-11-06T12:00:00Z'),
        endsAt: null,
        source: 'trial',
        subscriptionId: null,
        endReason: null,
        trialEndsAt: new Date(NOW.getTime() + 10 * DAY_MS),
        trialNoticeSentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides
    };
}

function build(line: CompanyProduct | null) {
    const plans = {
        openLineOf: vi.fn().mockResolvedValue(line),
        convertTrial: vi.fn().mockResolvedValue(true),
        markTrialNoticeSent: vi.fn().mockResolvedValue(true),
        trialsToProcess: vi.fn().mockResolvedValue([])
    };
    const contracts = { close: vi.fn().mockResolvedValue(true), priceCentsOf: vi.fn().mockResolvedValue(1490) };
    const notifier = { notify: vi.fn().mockResolvedValue(1) };
    const logs = { trialNoticed: vi.fn() };
    const catalog = { productOf: vi.fn().mockResolvedValue({ id: 'p1' }) };
    const service: TrialLifecycleService = new TrialLifecycleService(
        catalog as unknown as PlanCatalogDomain,
        plans as unknown as PlanDomain,
        contracts as unknown as PlanContractService,
        notifier as unknown as TrialNotifier,
        logs as unknown as PlansLogService
    );
    return { service, plans, contracts, notifier };
}

describe('TrialLifecycleService.settle', () => {
    it('ignores a company without a trial contract', async () => {
        expect(await build(null).service.settle('c1', NOW)).toBe('none');
        expect(await build(trialLine({ source: 'subscription', trialEndsAt: null })).service.settle('c1', NOW)).toBe('none');
    });

    it('does nothing while the trial is far from the end', async () => {
        const { service, notifier, contracts } = build(trialLine());

        expect(await service.settle('c1', NOW)).toBe('none');
        expect(notifier.notify).not.toHaveBeenCalled();
        expect(contracts.close).not.toHaveBeenCalled();
    });

    it('sends the notice once inside the three-day window', async () => {
        const endsAt: Date = new Date(NOW.getTime() + 2 * DAY_MS);
        const { service, notifier, plans } = build(trialLine({ trialEndsAt: endsAt }));

        expect(await service.settle('c1', NOW)).toBe('noticed');
        expect(plans.markTrialNoticeSent).toHaveBeenCalledWith('p1', NOW);
        expect(notifier.notify).toHaveBeenCalledWith({ companyId: 'c1', template: 'trial-ending', endsAt });
    });

    it('skips the notice already sent, the one with a subscription and the lost race', async () => {
        const endsAt: Date = new Date(NOW.getTime() + 2 * DAY_MS);

        expect(await build(trialLine({ trialEndsAt: endsAt, trialNoticeSentAt: NOW })).service.settle('c1', NOW)).toBe('none');
        expect(await build(trialLine({ trialEndsAt: endsAt, subscriptionId: 's1' })).service.settle('c1', NOW)).toBe('none');
        const lost = build(trialLine({ trialEndsAt: endsAt }));
        lost.plans.markTrialNoticeSent.mockResolvedValue(false);
        expect(await lost.service.settle('c1', NOW)).toBe('none');
        expect(lost.notifier.notify).not.toHaveBeenCalled();
    });

    it('closes an expired trial at its end and tells the owner', async () => {
        const endsAt: Date = new Date(NOW.getTime() - 60 * 60 * 1000);
        const { service, contracts, notifier } = build(trialLine({ trialEndsAt: endsAt }));

        expect(await service.settle('c1', NOW)).toBe('ended');
        expect(contracts.close).toHaveBeenCalledWith('premium', { endsAt, reason: 'trial_ended' });
        expect(notifier.notify).toHaveBeenCalledWith({ companyId: 'c1', template: 'trial-ended', endsAt });
    });

    it('does not repeat the e-mail when the contract was already closed by another run', async () => {
        const { service, contracts, notifier } = build(trialLine({ trialEndsAt: new Date(NOW.getTime() - 1000) }));
        contracts.close.mockResolvedValue(false);

        expect(await service.settle('c1', NOW)).toBe('none');
        expect(notifier.notify).not.toHaveBeenCalled();
    });

    it('turns an expired trial with a subscription into the paid contract without closing it', async () => {
        const { service, contracts, plans, notifier } = build(
            trialLine({ trialEndsAt: new Date(NOW.getTime() - 1000), subscriptionId: 's1' })
        );

        expect(await service.settle('c1', NOW)).toBe('converted');
        expect(plans.convertTrial).toHaveBeenCalledWith('p1', 's1', 1490);
        expect(contracts.close).not.toHaveBeenCalled();
        expect(notifier.notify).not.toHaveBeenCalled();
    });
});
