import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlsAppContext } from '../../../core/context/als-app-context';
import { ContextHolder } from '../../../core/context/as-company.decorator';
import { DatabaseClient } from '../../../core/database/database.client';
import { TransactionalContext } from '../../../core/database/using-transaction.decorator';
import { CustomerAccount, PlatformAccountReaderService } from '../../identity/services/platform-account-reader.service';
import { PlatformAuditRecorderService } from '../../identity/services/platform-audit-recorder.service';
import { PlatformBillingReaderService } from '../../billing/services/platform-billing-reader.service';
import { PlatformPlanReaderService } from '../../plans/services/platform-plan-reader.service';
import { PlatformAccountNotFoundError } from '../domain/platform-admin.errors';
import { AccessRequestDto } from '../validation/platform-accounts.schemas';
import { PlatformAccountsApplication } from './platform-accounts.application';

const context: AlsAppContext = new AlsAppContext();
ContextHolder.set(context);
TransactionalContext.set({ withTransaction: async (fn: () => Promise<unknown>) => fn() } as unknown as DatabaseClient);

const COMPANY: CustomerAccount = {
    id: '0198b9a0-0000-7000-8000-000000000001',
    name: 'Casa Silva',
    locale: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    createdAt: new Date('2026-05-01T00:00:00Z')
};
const OPERATOR: string = '0198b9a0-0000-7000-8000-0000000000aa';

interface Harness {
    readonly app: PlatformAccountsApplication;
    readonly calls: string[];
    readonly viewed: ReturnType<typeof vi.fn>;
    readonly fns: Record<string, ReturnType<typeof vi.fn>>;
}

function build(options: { company?: CustomerAccount | null; auditFails?: boolean } = {}): Harness {
    const calls: string[] = [];
    const viewed: ReturnType<typeof vi.fn> = vi.fn().mockImplementation(() => {
        calls.push('audit');
        return options.auditFails === true ? Promise.reject(new Error('audit down')) : Promise.resolve();
    });
    const fns: Record<string, ReturnType<typeof vi.fn>> = {
        find: vi.fn().mockResolvedValue(options.company === undefined ? COMPANY : options.company),
        members: vi.fn().mockImplementation(() => {
            calls.push('members');
            return Promise.resolve([
                { id: 'u1', name: 'Ana', email: 'ana@example.test', role: 'owner', joinedAt: new Date('2026-05-01T00:00:00Z') }
            ]);
        }),
        summarySections: vi.fn().mockImplementation(() => {
            calls.push('summary');
            return Promise.resolve({ billing: { subscriptions: [] }, signup_offer: null, usage: [] });
        }),
        dataSections: vi.fn().mockImplementation(() => {
            calls.push('data');
            return Promise.resolve({ goals: [] });
        }),
        overview: vi.fn().mockResolvedValue({
            total: 10,
            createdSince: 3,
            premium: 4,
            trials: 3,
            cardTrials: 2,
            noCardTrials: 1,
            estimatedMonthlyRevenueCents: 2235
        }),
        pastDueCount: vi.fn().mockResolvedValue(1),
        ofCompanies: vi
            .fn()
            .mockResolvedValue(
                new Map([
                    [COMPANY.id, { plan: 'premium', source: 'trial', since: new Date(), trialEndsAt: new Date('2026-06-01T00:00:00Z') }]
                ])
            )
    };
    const app: PlatformAccountsApplication = new PlatformAccountsApplication(
        fns as unknown as PlatformAccountReaderService,
        fns as unknown as PlatformPlanReaderService,
        fns as unknown as PlatformBillingReaderService,
        { accountViewed: viewed } as unknown as PlatformAuditRecorderService,
        context
    );
    return { app, calls, viewed, fns };
}

function asOperator<T>(fn: () => Promise<T>): Promise<T> {
    return context.run({ requestId: 'r1', userId: OPERATOR, companyId: 'platform-company', platform: true, locale: 'pt-BR' }, fn);
}

describe('PlatformAccountsApplication.overview', () => {
    it('breaks the trials by kind and adds the overdue accounts and the estimated revenue', async () => {
        const result = await build().app.overview();

        expect(result.plans).toEqual({
            free: 6,
            premium: 4,
            trials: 3,
            trialsWithCard: 2,
            trialsWithoutCard: 1,
            pastDue: 1
        });
        expect(result.revenue).toEqual({ estimatedMonthlyCents: 2235 });
    });
});

describe('PlatformAccountsApplication.access', () => {
    let harness: Harness;

    beforeEach(() => {
        harness = build();
    });

    it('records account.viewed with the reason and layers before any customer data is read', async () => {
        const input: AccessRequestDto = { reason: 'Cliente pediu ajuda com a carteira', layers: ['summary', 'data'] };

        const result = await asOperator(async () => harness.app.access(COMPANY.id, input));

        expect(harness.viewed).toHaveBeenCalledWith(OPERATOR, COMPANY.id, { reason: input.reason, layers: ['summary', 'data'] });
        expect(harness.calls[0]).toBe('audit');
        expect(result.summary?.people).toHaveLength(1);
        expect(result.summary?.account.plan).toBe('premium');
        expect(result.data).toEqual({ goals: [] });
    });

    it('reads no customer data when the audit entry cannot be recorded', async () => {
        harness = build({ auditFails: true });

        await expect(
            asOperator(async () => harness.app.access(COMPANY.id, { reason: 'Verificar cobrança', layers: ['summary', 'data'] }))
        ).rejects.toThrow('audit down');

        expect(harness.calls).toEqual(['audit']);
    });

    it('returns only the layer asked for', async () => {
        const result = await asOperator(async () => harness.app.access(COMPANY.id, { reason: 'Verificar cobrança', layers: ['summary'] }));

        expect(result.data).toBeUndefined();
        expect(harness.fns['dataSections']).not.toHaveBeenCalled();
        expect(result.summary?.billing).toEqual({ subscriptions: [] });
    });

    it('answers not found, with no audit entry, for an unknown or platform account', async () => {
        harness = build({ company: null });

        await expect(
            asOperator(async () => harness.app.access(COMPANY.id, { reason: 'Verificar cobrança', layers: ['data'] }))
        ).rejects.toBeInstanceOf(PlatformAccountNotFoundError);

        expect(harness.viewed).not.toHaveBeenCalled();
    });
});

describe('PlatformAccountsApplication.list', () => {
    it('maps the page with the plan of each account and opens no customer data', async () => {
        const harness: Harness = build();
        harness.fns['page'] = vi.fn().mockResolvedValue({ items: [COMPANY], page: 1, pageSize: 25, total: 1 });

        const view = await harness.app.list({ page: 1, pageSize: 25, search: undefined });

        expect(view.total).toBe(1);
        expect(view.items[0]).toMatchObject({ id: COMPANY.id, plan: 'premium', planSource: 'trial' });
        expect(harness.fns['dataSections']).not.toHaveBeenCalled();
        expect(harness.viewed).not.toHaveBeenCalled();
    });
});
