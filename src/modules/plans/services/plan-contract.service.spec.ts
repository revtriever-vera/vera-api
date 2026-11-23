import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabaseClient } from '../../../core/database/database.client';
import { TransactionalContext } from '../../../core/database/using-transaction.decorator';
import { CompanyTrialService } from '../../identity/services/company-trial.service';
import { PlanCatalogDomain } from '../domain/plan-catalog.domain';
import { PlanDomain } from '../domain/plan.domain';
import { BillingNotAvailableError, TrialAlreadyUsedError, TrialUnavailableError } from '../domain/plans.errors';
import { PlanContractService } from './plan-contract.service';
import { PlanResolverService } from './plan-resolver.service';
import { PlansLogService } from './plans-log.service';
import { PremiumEndedService } from './premium-ended.service';

beforeAll(() => {
    TransactionalContext.set({ withTransaction: async <T>(fn: () => Promise<T>): Promise<T> => fn() } as unknown as DatabaseClient);
});

const STARTS_AT: Date = new Date('2026-11-06T12:00:00Z');

function build(options: { mode?: string; open?: object | null; marked?: boolean; platform?: boolean } = {}) {
    const plans = {
        openLineOf: vi.fn().mockResolvedValue(options.open ?? null),
        open: vi.fn().mockResolvedValue(true),
        convertCardTrial: vi.fn().mockResolvedValue(true)
    };
    const trials = {
        markStarted: vi.fn().mockResolvedValue(options.marked ?? true),
        history: vi.fn().mockResolvedValue({ isPlatform: options.platform ?? false, trialUsed: false })
    };
    const resolver = { mode: vi.fn().mockReturnValue(options.mode ?? 'hosted') };
    const catalog = { productOf: vi.fn().mockResolvedValue({ id: 'p1' }), priceCentsOf: vi.fn().mockResolvedValue(1490) };
    const service: PlanContractService = new PlanContractService(
        catalog as unknown as PlanCatalogDomain,
        plans as unknown as PlanDomain,
        {} as PremiumEndedService,
        resolver as unknown as PlanResolverService,
        trials as unknown as CompanyTrialService,
        { contractOpened: vi.fn() } as unknown as PlansLogService
    );
    return { service, plans, trials };
}

describe('PlanContractService.openTrial', () => {
    it('opens a free contract that ends after the given days', async () => {
        const { service, plans } = build();

        await service.openTrial('premium', { startsAt: STARTS_AT, days: 14 });

        expect(plans.open).toHaveBeenCalledWith('p1', 0, STARTS_AT, 'trial', null, new Date('2026-11-20T12:00:00Z'));
    });

    it('refuses a second trial for the same account', async () => {
        const { service, plans } = build({ marked: false });

        await expect(service.openTrial('premium', { startsAt: STARTS_AT, days: 14 })).rejects.toBeInstanceOf(TrialAlreadyUsedError);
        expect(plans.open).not.toHaveBeenCalled();
    });

    it('refuses when the account already has a Premium contract, without spending the trial', async () => {
        const { service, trials } = build({ open: { id: 'l1' } });

        await expect(service.openTrial('premium', { startsAt: STARTS_AT, days: 14 })).rejects.toBeInstanceOf(TrialUnavailableError);
        expect(trials.markStarted).not.toHaveBeenCalled();
    });

    it('does not exist in a self-hosted installation', async () => {
        const { service } = build({ mode: 'self_hosted' });

        await expect(service.openTrial('premium', { startsAt: STARTS_AT, days: 14 })).rejects.toBeInstanceOf(BillingNotAvailableError);
    });
});

describe('PlanContractService.trialOf', () => {
    it('returns the end and the attached subscription of an open trial, and null for a paid contract', async () => {
        const endsAt: Date = new Date('2026-11-20T12:00:00Z');
        const trial = build({ open: { source: 'trial', trialEndsAt: endsAt, subscriptionId: 's1' } });
        const paid = build({ open: { source: 'subscription', trialEndsAt: null, subscriptionId: 's1' } });

        expect(await trial.service.trialOf('premium')).toEqual({ endsAt, subscriptionId: 's1' });
        expect(await paid.service.trialOf('premium')).toBeNull();
        expect(await build().service.trialOf('premium')).toBeNull();
    });
});

describe('PlanContractService card trial', () => {
    const ENDS_AT: Date = new Date('2026-11-20T03:00:00Z');

    it('opens a free card_trial contract ending at the first charge and spends the company trial', async () => {
        const { service, plans, trials } = build();

        expect(await service.openCardTrial('premium', { startsAt: STARTS_AT, endsAt: ENDS_AT, subscriptionId: 's1' })).toBe(true);

        expect(trials.markStarted).toHaveBeenCalledWith(STARTS_AT);
        expect(plans.open).toHaveBeenCalledWith('p1', 0, STARTS_AT, 'card_trial', 's1', ENDS_AT);
    });

    it('does nothing when a contract is already open, without spending the trial', async () => {
        const { service, plans, trials } = build({ open: { id: 'l1' } });

        expect(await service.openCardTrial('premium', { startsAt: STARTS_AT, endsAt: ENDS_AT, subscriptionId: 's1' })).toBe(false);

        expect(trials.markStarted).not.toHaveBeenCalled();
        expect(plans.open).not.toHaveBeenCalled();
    });

    it('refuses when the company already used its trial', async () => {
        const { service, plans } = build({ marked: false });

        await expect(
            service.openCardTrial('premium', { startsAt: STARTS_AT, endsAt: ENDS_AT, subscriptionId: 's1' })
        ).rejects.toBeInstanceOf(TrialAlreadyUsedError);
        expect(plans.open).not.toHaveBeenCalled();
    });

    it('reads the card trial only from a card_trial line and converts it with the catalog price', async () => {
        const card = build({ open: { source: 'card_trial', trialEndsAt: ENDS_AT, subscriptionId: 's1' } });
        const noCard = build({ open: { source: 'trial', trialEndsAt: ENDS_AT, subscriptionId: 's1' } });

        expect(await card.service.cardTrialOf('premium')).toEqual({ endsAt: ENDS_AT });
        expect(await noCard.service.cardTrialOf('premium')).toBeNull();
        expect(await build().service.cardTrialOf('premium')).toBeNull();
        expect(await card.service.convertCardTrial('premium')).toBe(true);
        expect(card.plans.convertCardTrial).toHaveBeenCalledWith('p1', 1490);
    });
});

describe('PlanContractService.isPlatformCompany', () => {
    it('reflects the company flag', async () => {
        expect(await build({ platform: true }).service.isPlatformCompany()).toBe(true);
        expect(await build().service.isPlatformCompany()).toBe(false);
    });
});
