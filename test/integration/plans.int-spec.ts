import { Controller, Get, Injectable, Module, UseGuards } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../src/core/context/app-context.port';
import { ContextModule } from '../../src/core/context/context.module';
import { IdentityApplicationModule } from '../../src/modules/identity/application/identity-application.module';
import { JwtAuthGuard } from '../../src/modules/identity/services/jwt-auth.guard';
import { RequiresRole } from '../../src/modules/identity/services/requires-role.decorator';
import { RolesGuard } from '../../src/modules/identity/services/roles.guard';
import { PremiumEndedRetryApplication } from '../../src/modules/plans/application/premium-ended-retry.application';
import { PlanUsageContextAdapter } from '../../src/modules/plans/services/plan-usage-context.adapter';
import { PlansApplicationModule } from '../../src/modules/plans/application/plans-application.module';
import { PaidFeature, PaidUsageSnapshot } from '../../src/modules/plans/domain/plans.types';
import { PaidFeatureAvailabilityPort } from '../../src/modules/plans/services/paid-feature-availability.port';
import { PaidUsageReader } from '../../src/modules/plans/services/paid-usage-reader.service';
import { PlanContractService } from '../../src/modules/plans/services/plan-contract.service';
import { PremiumEndedService } from '../../src/modules/plans/services/premium-ended.service';
import { PremiumGuard } from '../../src/modules/plans/services/premium.guard';
import { PremiumLifecyclePort } from '../../src/modules/plans/services/premium-lifecycle.port';
import { RequiresFeature } from '../../src/modules/plans/services/requires-feature.decorator';
import { AllocationHarness } from './support/allocation-harness';
import { CapturingPublisher } from './support/queue';

const keys: Record<PaidFeature, boolean> = { ai: true, whatsapp: false, calendar: false };
const lifecycle = { failOnce: true, calls: [] as string[] };

@Injectable()
class AiAvailability extends PaidFeatureAvailabilityPort {
    public readonly feature: PaidFeature = 'ai';
    public async enabled(): Promise<boolean> {
        return Promise.resolve(keys.ai);
    }
}

@Injectable()
class WhatsappAvailability extends PaidFeatureAvailabilityPort {
    public readonly feature: PaidFeature = 'whatsapp';
    public async enabled(): Promise<boolean> {
        return Promise.resolve(keys.whatsapp);
    }
}

@Injectable()
class StableHandler extends PremiumLifecyclePort {
    public readonly name: string = 'stable';
    public async onPremiumEnded(): Promise<void> {
        lifecycle.calls.push(this.name);
        return Promise.resolve();
    }
}

@Injectable()
class FlakyHandler extends PremiumLifecyclePort {
    public readonly name: string = 'flaky';
    public async onPremiumEnded(): Promise<void> {
        lifecycle.calls.push(this.name);
        if (lifecycle.failOnce) {
            lifecycle.failOnce = false;
            throw new Error('first attempt fails');
        }
        return Promise.resolve();
    }
}

@Controller('probe-feature')
@UseGuards(JwtAuthGuard, RolesGuard, PremiumGuard)
class ProbeController {
    @Get()
    @RequiresRole('viewer')
    @RequiresFeature('ai')
    public ai(): { ok: boolean } {
        return { ok: true };
    }
}

@Module({
    imports: [PlansApplicationModule, IdentityApplicationModule, ContextModule],
    controllers: [ProbeController],
    providers: [AiAvailability, WhatsappAvailability, StableHandler, FlakyHandler]
})
class FakeFeaturesModule {}

interface Me {
    readonly mode: string;
    readonly plan: string;
    readonly canManage: boolean;
    readonly methods: string[];
    readonly priceCents: number | null;
    readonly features: Record<PaidFeature, string>;
    readonly usage: { capMicros: number | null } | null;
    readonly trial: { kind: string; endsAt: string; daysLeft: number } | null;
}

describe('plans (hosted)', () => {
    let harness: AllocationHarness;
    const publisher: CapturingPublisher = new CapturingPublisher();

    beforeAll(async () => {
        harness = await AllocationHarness.start('plans_hosted', publisher, [FakeFeaturesModule]);
    });

    afterAll(async () => {
        await harness.stop();
    });

    function contracts(): PlanContractService {
        return harness.app.get(PlanContractService, { strict: false });
    }

    it('sem contrato: free, premium_required e funções sem chave desabilitadas', async () => {
        const account = await harness.signUp('free');

        const me = await harness.call<Me>(account.token, 'GET', '/billing/me');

        expect(me.status).toBe(200);
        expect(me.body).toMatchObject({
            mode: 'hosted',
            plan: 'free',
            canManage: true,
            methods: ['card', 'pix'],
            priceCents: 1490,
            features: { ai: 'premium_required', whatsapp: 'disabled', calendar: 'premium_required' }
        });
        expect((await harness.call(account.token, 'GET', '/probe-feature')).status).toBe(402);
    });

    it('abrir o contrato dá premium, é idempotente e fechar volta ao free chamando os implementadores', async () => {
        const account = await harness.signUp('premium');
        const startsAt: Date = new Date('2026-11-01T00:00:00Z');
        const subscriptionId: string = crypto.randomUUID();

        await harness.inCompany(account.company.id, async () => {
            await contracts().open('premium', { startsAt, subscriptionId });
            await contracts().open('premium', { startsAt, subscriptionId });
        });
        const opened = await harness.pg.query('SELECT count(*)::int AS total FROM "CompanyProducts" WHERE "companyId" = $1', [
            account.company.id
        ]);
        const me = await harness.call<Me>(account.token, 'GET', '/billing/me');

        expect(opened.rows[0]).toEqual({ total: 1 });
        expect(me.body).toMatchObject({ plan: 'premium', features: { ai: 'available' } });
        expect((await harness.call(account.token, 'GET', '/probe-feature')).status).toBe(200);

        lifecycle.calls.length = 0;
        await harness.inCompany(account.company.id, async () => {
            await contracts().close('premium', { endsAt: new Date(), reason: 'canceled' });
        });

        expect(lifecycle.calls.sort()).toEqual(['flaky', 'stable']);
        expect((await harness.call<Me>(account.token, 'GET', '/billing/me')).body.plan).toBe('free');
        const failed = await harness.pg.query(
            'SELECT "handler", "status", "attempts" FROM "PremiumEndedNotifications" WHERE "companyId" = $1 ORDER BY "handler"',
            [account.company.id]
        );
        expect(failed.rows).toEqual([
            { handler: 'calendar', status: 'done', attempts: 0 },
            { handler: 'flaky', status: 'failed', attempts: 1 },
            { handler: 'reminders', status: 'done', attempts: 0 },
            { handler: 'stable', status: 'done', attempts: 0 },
            { handler: 'whatsapp-links', status: 'done', attempts: 0 }
        ]);
        expect(publisher.ofType('plans.premium-ended.retry.requested').length).toBeGreaterThan(0);

        await harness.app
            .get(AppContext)
            .run({ requestId: 'sweep', locale: 'pt-BR' }, async () => harness.app.get(PremiumEndedService, { strict: false }).sweep());

        const healed = await harness.pg.query(
            'SELECT "handler", "status" FROM "PremiumEndedNotifications" WHERE "companyId" = $1 ORDER BY "handler"',
            [account.company.id]
        );
        expect(healed.rows).toEqual([
            { handler: 'calendar', status: 'done' },
            { handler: 'flaky', status: 'done' },
            { handler: 'reminders', status: 'done' },
            { handler: 'stable', status: 'done' },
            { handler: 'whatsapp-links', status: 'done' }
        ]);
    });

    it('o contrato de uma company não dá premium a outra', async () => {
        const first = await harness.signUp('isolation-a');
        const second = await harness.signUp('isolation-b');

        await harness.inCompany(first.company.id, async () => {
            await contracts().open('premium', { startsAt: new Date(), subscriptionId: crypto.randomUUID() });
        });

        expect((await harness.call<Me>(first.token, 'GET', '/billing/me')).body.plan).toBe('premium');
        expect((await harness.call<Me>(second.token, 'GET', '/billing/me')).body.plan).toBe('free');
    });

    it('a cota pausada vira 429 com resetsAt e a função sem chave vira 503', async () => {
        const account = await harness.signUp('paused');
        await harness.inCompany(account.company.id, async () => {
            await contracts().open('premium', { startsAt: new Date(), subscriptionId: crypto.randomUUID() });
        });
        const snapshot: PaidUsageSnapshot = {
            usedBps: 10000,
            state: 'paused',
            resetsAt: '2026-12-01T03:00:00.000Z',
            byFeature: { ai: { usedBps: 10000 }, whatsapp: { usedBps: 0 } }
        };
        const spy = vi.spyOn(harness.app.get(PaidUsageReader, { strict: false }), 'state').mockResolvedValue(snapshot);

        const paused = await harness.call<{ type: string; meta?: { resetsAt: string } }>(account.token, 'GET', '/probe-feature');
        spy.mockRestore();
        keys.ai = false;
        const disabled = await harness.call<{ type: string }>(account.token, 'GET', '/probe-feature');
        keys.ai = true;

        expect(paused.status).toBe(429);
        expect(paused.body.type).toBe('usage.cap_reached');
        expect(disabled.status).toBe(503);
        expect(disabled.body.type).toBe('billing.feature_disabled');
    });

    describe('teste sem cartão', () => {
        const DAY_MS: number = 24 * 60 * 60 * 1000;
        const startsAt: Date = new Date('2026-11-01T12:00:00Z');

        function lifecycleApplication(): PremiumEndedRetryApplication {
            return harness.app.get(PremiumEndedRetryApplication, { strict: false });
        }

        async function sweepAt(now: Date): Promise<number> {
            return harness.app
                .get(AppContext)
                .run({ requestId: 'trial-sweep', locale: 'pt-BR' }, async () => lifecycleApplication().sweepTrials(now));
        }

        function mailsOf(template: string, companyId: string): number {
            return publisher
                .ofType('email.send.requested')
                .filter((message) => (message.payload as { template: string; reference: string }).template === template)
                .filter((message) => (message.payload as { reference: string }).reference.startsWith(companyId)).length;
        }

        async function sourceOf(companyId: string): Promise<{ source: string; endsAt: Date | null; priceCents: string }> {
            const row = await harness.pg.query(
                'SELECT "source", "endsAt", "priceCents" FROM "CompanyProducts" WHERE "companyId" = $1 ORDER BY "createdAt" DESC LIMIT 1',
                [companyId]
            );
            return row.rows[0] as { source: string; endsAt: Date | null; priceCents: string };
        }

        it('o resgate abre o Premium sem assinatura, mostra a faixa e mantém a cota do mês', async () => {
            const account = await harness.signUp('trial-open');
            await harness.inCompany(account.company.id, async () => {
                await contracts().openTrial('premium', { startsAt: new Date(), days: 14 });
            });

            const me = await harness.call<Me>(account.token, 'GET', '/billing/me');
            const cap: number | null = await harness.inCompany(account.company.id, async () =>
                harness.app.get(PlanUsageContextAdapter, { strict: false }).capMicros()
            );

            expect(me.body).toMatchObject({ plan: 'premium', features: { ai: 'available' }, trial: { kind: 'no_card', daysLeft: 14 } });
            expect(cap).toBe(4000000);
            const snapshot: PaidUsageSnapshot = {
                usedBps: 10000,
                state: 'paused',
                resetsAt: '2026-12-01T03:00:00.000Z',
                byFeature: { ai: { usedBps: 10000 }, whatsapp: { usedBps: 0 } }
            };
            const spy = vi.spyOn(harness.app.get(PaidUsageReader, { strict: false }), 'state').mockResolvedValue(snapshot);
            const paused = await harness.call<{ type: string }>(account.token, 'GET', '/probe-feature');
            spy.mockRestore();
            expect(paused.status).toBe(429);
            expect(paused.body.type).toBe('usage.cap_reached');
        });

        it('avisa uma vez a três dias do fim, fecha no fim chamando o lifecycle e não repete', async () => {
            const account = await harness.signUp('trial-end');
            const endsAt: Date = new Date(startsAt.getTime() + 14 * DAY_MS);
            await harness.inCompany(account.company.id, async () => {
                await contracts().openTrial('premium', { startsAt, days: 14 });
            });

            await sweepAt(new Date(startsAt.getTime() + 5 * DAY_MS));
            expect(mailsOf('trial-ending', account.company.id)).toBe(0);
            await sweepAt(new Date(endsAt.getTime() - 2 * DAY_MS));
            await sweepAt(new Date(endsAt.getTime() - 1 * DAY_MS));
            expect(mailsOf('trial-ending', account.company.id)).toBe(1);

            lifecycle.calls.length = 0;
            await sweepAt(new Date(endsAt.getTime() + 60 * 60 * 1000));
            await sweepAt(new Date(endsAt.getTime() + 2 * 60 * 60 * 1000));

            expect(lifecycle.calls.sort()).toEqual(['flaky', 'stable']);
            expect(mailsOf('trial-ended', account.company.id)).toBe(1);
            expect((await sourceOf(account.company.id)).endsAt).toEqual(endsAt);
            const me = await harness.call<Me>(account.token, 'GET', '/billing/me');
            expect(me.body).toMatchObject({ plan: 'free', trial: null });
        });

        it('recusa um segundo teste, mesmo depois do fim do primeiro, e quem já é Premium', async () => {
            const account = await harness.signUp('trial-twice');
            const other = await harness.signUp('trial-paid');
            await harness.inCompany(account.company.id, async () => {
                await contracts().openTrial('premium', { startsAt, days: 14 });
            });
            await sweepAt(new Date(startsAt.getTime() + 20 * DAY_MS));

            await harness.inCompany(account.company.id, async () => {
                await expect(contracts().openTrial('premium', { startsAt: new Date(), days: 14 })).rejects.toMatchObject({
                    code: 'billing.trial_already_used'
                });
            });
            await harness.inCompany(other.company.id, async () => {
                await contracts().open('premium', { startsAt, subscriptionId: crypto.randomUUID() });
                await expect(contracts().openTrial('premium', { startsAt: new Date(), days: 14 })).rejects.toMatchObject({
                    code: 'billing.trial_unavailable'
                });
            });
            const marked = await harness.pg.query('SELECT "trialStartedAt" FROM "Companies" WHERE "id" = $1', [other.company.id]);
            expect(marked.rows[0]).toEqual({ trialStartedAt: null });
        });

        it('assinar no teste: no fim o contrato vira assinatura sem fechar e sem chamar o lifecycle', async () => {
            const account = await harness.signUp('trial-subscribed');
            const endsAt: Date = new Date(startsAt.getTime() + 14 * DAY_MS);
            await harness.inCompany(account.company.id, async () => {
                await contracts().openTrial('premium', { startsAt, days: 14 });
                await contracts().attachSubscription('premium', crypto.randomUUID());
            });

            await sweepAt(new Date(endsAt.getTime() - 1 * DAY_MS));
            lifecycle.calls.length = 0;
            await sweepAt(new Date(endsAt.getTime() + 60 * 60 * 1000));

            expect(mailsOf('trial-ending', account.company.id)).toBe(0);
            expect(mailsOf('trial-ended', account.company.id)).toBe(0);
            expect(lifecycle.calls).toEqual([]);
            expect(await sourceOf(account.company.id)).toEqual({ source: 'subscription', endsAt: null, priceCents: '1490' });
            expect((await harness.call<Me>(account.token, 'GET', '/billing/me')).body).toMatchObject({ plan: 'premium', trial: null });
        });

        it('cancelar a assinatura antes do fim volta ao fim sem assinar', async () => {
            const account = await harness.signUp('trial-canceled');
            const endsAt: Date = new Date(startsAt.getTime() + 14 * DAY_MS);
            await harness.inCompany(account.company.id, async () => {
                await contracts().openTrial('premium', { startsAt, days: 14 });
                await contracts().attachSubscription('premium', crypto.randomUUID());
                await contracts().detachSubscription('premium');
            });

            await sweepAt(new Date(endsAt.getTime() + 60 * 60 * 1000));

            expect(mailsOf('trial-ended', account.company.id)).toBe(1);
            expect((await harness.call<Me>(account.token, 'GET', '/billing/me')).body.plan).toBe('free');
        });
    });
});

describe('plans (self_hosted)', () => {
    let harness: AllocationHarness;

    beforeAll(async () => {
        process.env['DEPLOYMENT_MODE'] = 'self_hosted';
        harness = await AllocationHarness.start('plans_self', new CapturingPublisher(), [FakeFeaturesModule]);
    });

    afterAll(async () => {
        delete process.env['DEPLOYMENT_MODE'];
        await harness.stop();
    });

    it('não tem plano nem cobrança: self_hosted, sem métodos nem preço, e libera o que tem chave', async () => {
        const account = await harness.signUp('self');

        const me = await harness.call<Me>(account.token, 'GET', '/billing/me');

        expect(me.body).toMatchObject({
            mode: 'self_hosted',
            plan: 'self_hosted',
            methods: [],
            priceCents: null,
            features: { ai: 'available', whatsapp: 'disabled', calendar: 'disabled' }
        });
        expect((await harness.call(account.token, 'GET', '/probe-feature')).status).toBe(200);
    });
});
