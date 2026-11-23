import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabaseClient } from '../../../core/database/database.client';
import { TransactionalContext } from '../../../core/database/using-transaction.decorator';
import { CompanyTrialService } from '../../identity/services/company-trial.service';
import { PlatformAvailabilityService } from '../../identity/services/platform-availability.service';
import { PlanContractService } from '../../plans/services/plan-contract.service';
import { ThrottleService } from '../../../core/throttle/throttle.service';
import { SignupLinkDomain } from '../domain/signup-link.domain';
import { SignupRedemptionDomain } from '../domain/signup-redemption.domain';
import { SignupLink, SignupRedemption } from '../domain/signup-links.types';
import { OfferRedemptionService } from './offer-redemption.service';
import { TrialEmailMarkService } from './trial-email-mark.service';

const NOW: Date = new Date('2026-11-23T12:00:00.000Z');
const SUBJECT = { companyId: 'c', userId: 'u', email: 'ana@example.test', emailVerified: true, isOwner: true, ip: '203.0.113.9' };

function link(overrides: Partial<SignupLink> = {}): SignupLink {
    return {
        id: 'link',
        token: 'token',
        label: 'Parceria',
        trialKind: 'no_card',
        trialDays: 7,
        rules: [],
        maxUses: 10,
        expiresAt: new Date(NOW.getTime() + 86_400_000),
        offerValidityDays: 30,
        redemptionCount: 0,
        trialCount: 0,
        subscriptionCount: 0,
        revokedAt: null,
        createdByUserId: null,
        createdAt: NOW,
        updatedAt: NOW,
        ...overrides
    };
}

interface Options {
    readonly link?: SignupLink | null;
    readonly enabled?: boolean;
    readonly consumed?: SignupLink | null;
    readonly markClaimed?: boolean;
    readonly recorded?: SignupRedemption | null;
    readonly ipAllowed?: boolean;
    readonly everPremium?: boolean;
}

function build(options: Options = {}): {
    service: OfferRedemptionService;
    consumeUse: ReturnType<typeof vi.fn>;
    claim: ReturnType<typeof vi.fn>;
    record: ReturnType<typeof vi.fn>;
    openTrial: ReturnType<typeof vi.fn>;
} {
    const consumeUse: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(options.consumed === undefined ? link() : options.consumed);
    const claim: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(options.markClaimed ?? true);
    const record: ReturnType<typeof vi.fn> = vi
        .fn()
        .mockResolvedValue(options.recorded === undefined ? ({ id: 'r' } as SignupRedemption) : options.recorded);
    const openTrial: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const service: OfferRedemptionService = new OfferRedemptionService(
        {
            findByToken: vi.fn().mockResolvedValue(options.link === undefined ? link() : options.link),
            consumeUse
        } as unknown as SignupLinkDomain,
        { current: vi.fn().mockResolvedValue(null), record } as unknown as SignupRedemptionDomain,
        { claim } as unknown as TrialEmailMarkService,
        { everHadPremium: vi.fn().mockResolvedValue(options.everPremium ?? false), openTrial } as unknown as PlanContractService,
        { history: vi.fn().mockResolvedValue({ isPlatform: false, trialUsed: false }) } as unknown as CompanyTrialService,
        { enabled: () => options.enabled ?? true } as unknown as PlatformAvailabilityService,
        { isAllowed: vi.fn().mockResolvedValue(options.ipAllowed ?? true) } as unknown as ThrottleService,
        { APP_URL: 'https://app.example.test', SIGNUP_EMAIL_MARK_HMAC_KEY: null, SIGNUP_REDEEM_IP_DAILY_LIMIT: 5 }
    );
    return { service, consumeUse, claim, record, openTrial };
}

describe('OfferRedemptionService.redeem', () => {
    beforeAll(() => {
        TransactionalContext.set({ withTransaction: async <T>(fn: () => Promise<T>): Promise<T> => fn() } as unknown as DatabaseClient);
    });

    it('teste sem cartão: consome o uso, marca o e-mail, grava o resgate e abre o teste', async () => {
        const { service, consumeUse, claim, record, openTrial } = build();

        await service.redeem('token', SUBJECT, 'signup');

        expect(consumeUse).toHaveBeenCalledWith('link', expect.any(Date), true);
        expect(claim).toHaveBeenCalledWith('ana@example.test', 'link');
        expect(record).toHaveBeenCalled();
        expect(openTrial).toHaveBeenCalledWith('premium', { startsAt: expect.any(Date) as Date, days: 7 });
    });

    it('só desconto: não marca o e-mail nem abre teste', async () => {
        const { service, claim, openTrial, consumeUse } = build({ link: link({ trialKind: 'none', trialDays: null }) });

        await service.redeem('token', SUBJECT, 'existing_account');

        expect(consumeUse).toHaveBeenCalledWith('link', expect.any(Date), false);
        expect(claim).not.toHaveBeenCalled();
        expect(openTrial).not.toHaveBeenCalled();
    });

    it('teste com cartão: marca o e-mail mas só abre o teste quando assinar', async () => {
        const { service, claim, openTrial } = build({ link: link({ trialKind: 'card' }) });

        await service.redeem('token', SUBJECT, 'signup');

        expect(claim).toHaveBeenCalled();
        expect(openTrial).not.toHaveBeenCalled();
    });

    it('na auto-hospedada é 404 sem consultar o link', async () => {
        const { service, consumeUse } = build({ enabled: false });

        await expect(service.redeem('token', SUBJECT, 'signup')).rejects.toMatchObject({ code: 'signup_links.not_found' });
        expect(consumeUse).not.toHaveBeenCalled();
    });

    it.each([
        ['link inexistente', { link: null }],
        ['link revogado', { link: link({ revokedAt: NOW }) }],
        ['link com limite batido', { link: link({ redemptionCount: 10 }) }]
    ])('%s é 404', async (_name: string, options: Options) => {
        const { service } = build(options);

        await expect(service.redeem('token', SUBJECT, 'signup')).rejects.toMatchObject({ code: 'signup_links.not_found' });
    });

    it('perdeu a corrida pelo último uso: 404 e nada mais é gravado', async () => {
        const { service, claim, record } = build({ consumed: null });

        await expect(service.redeem('token', SUBJECT, 'signup')).rejects.toMatchObject({ code: 'signup_links.not_found' });
        expect(claim).not.toHaveBeenCalled();
        expect(record).not.toHaveBeenCalled();
    });

    it('e-mail que já fez teste: recusa e não grava o resgate', async () => {
        const { service, record } = build({ markClaimed: false });

        await expect(service.redeem('token', SUBJECT, 'signup')).rejects.toMatchObject({ code: 'signup_links.email_already_used' });
        expect(record).not.toHaveBeenCalled();
    });

    it('resgate duplicado na mesma conta (corrida): conta não elegível', async () => {
        const { service } = build({ recorded: null });

        await expect(service.redeem('token', SUBJECT, 'signup')).rejects.toMatchObject({
            code: 'signup_links.account_not_eligible',
            meta: { reason: 'already_redeemed' }
        });
    });

    it('conta que já foi Premium: recusa antes de consumir o uso', async () => {
        const { service, consumeUse } = build({ everPremium: true });

        await expect(service.redeem('token', SUBJECT, 'signup')).rejects.toMatchObject({ meta: { reason: 'already_paid' } });
        expect(consumeUse).not.toHaveBeenCalled();
    });

    it('limite diário por IP', async () => {
        const { service, consumeUse } = build({ ipAllowed: false });

        await expect(service.redeem('token', SUBJECT, 'signup')).rejects.toMatchObject({ code: 'signup_links.too_many_from_ip' });
        expect(consumeUse).not.toHaveBeenCalled();
    });

    it('sem IP conhecido não consulta o limite', async () => {
        const { service } = build({ ipAllowed: false });

        await expect(service.redeem('token', { ...SUBJECT, ip: null }, 'signup')).resolves.toBeDefined();
    });
});
