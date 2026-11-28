import { Injectable, Module } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../src/core/context/app-context.port';
import { MailerPort } from '../../src/core/mail/mailer.port';
import { MetricsService } from '../../src/core/observability/metrics.service';
import { PaidSendMeter } from '../../src/core/usage/services/paid-send-meter.service';
import { PaidUsageMeter } from '../../src/core/usage/services/paid-usage-meter.service';
import { RecordUsageInput, UsageState } from '../../src/core/usage/usage.types';
import { UsageThresholdHandler } from '../../src/modules/plans/access/queue/usage-threshold.handler';
import { UsageApplication } from '../../src/modules/plans/application/usage.application';
import { PlansApplicationModule } from '../../src/modules/plans/application/plans-application.module';
import { PaidFeature } from '../../src/modules/plans/domain/plans.types';
import { PaidFeatureAvailabilityPort } from '../../src/modules/plans/services/paid-feature-availability.port';
import { PlanContractService } from '../../src/modules/plans/services/plan-contract.service';
import { PlanGateService } from '../../src/modules/plans/services/plan-gate.service';
import { UsageAccountEraser } from '../../src/modules/plans/services/usage-account.eraser';
import { UsageAccountExporter } from '../../src/modules/plans/services/usage-account.exporter';
import { AllocationHarness, Account } from './support/allocation-harness';
import { CapturingPublisher } from './support/queue';

const PRICE_TABLE: string = JSON.stringify({
    authentication: { currency: 'USD', amount: '0.10', date: '2026-01-01', source: 'tabela de teste' },
    utility: { currency: 'BRL', amount: '0.30', date: '2026-01-01', source: 'tabela de teste' }
});

interface UsageBody {
    readonly period: string;
    readonly state: string;
    readonly usedBps: number;
    readonly resetsAt: string;
    readonly byFeature: { ai: { usedBps: number }; whatsapp: { usedBps: number } };
    readonly capMicros: number | null;
}

@Injectable()
class AiAvailability extends PaidFeatureAvailabilityPort {
    public readonly feature: PaidFeature = 'ai';
    public async enabled(): Promise<boolean> {
        return Promise.resolve(true);
    }
}

@Module({ imports: [PlansApplicationModule], providers: [AiAvailability] })
class FakeAiModule {}

let sequence: number = 0;

function entry(overrides: Partial<RecordUsageInput> = {}): RecordUsageInput {
    sequence += 1;
    return {
        feature: 'ai',
        task: 'summary',
        referenceId: `ref-${String(sequence)}`,
        costMicros: 100_000,
        outcome: 'answered',
        ...overrides
    };
}

describe('paid usage (hosted)', () => {
    let harness: AllocationHarness;
    const publisher: CapturingPublisher = new CapturingPublisher();

    beforeAll(async () => {
        process.env['WHATSAPP_PRICE_TABLE'] = PRICE_TABLE;
        process.env['PAID_SEND_COST_MULTIPLIER'] = '2';
        harness = await AllocationHarness.start('usage_hosted', publisher, [FakeAiModule]);
    });

    afterAll(async () => {
        delete process.env['WHATSAPP_PRICE_TABLE'];
        delete process.env['PAID_SEND_COST_MULTIPLIER'];
        await harness.stop();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    function meter(): PaidUsageMeter {
        return harness.app.get(PaidUsageMeter, { strict: false });
    }

    async function withMeter<T>(account: Account, fn: (meter: PaidUsageMeter) => Promise<T>): Promise<T> {
        return harness.inCompany(account.company.id, async () => fn(meter()));
    }

    async function rows(account: Account): Promise<number> {
        const result = await harness.pg.query('SELECT count(*)::int AS total FROM "PaidUsageEntries" WHERE "companyId" = $1', [
            account.company.id
        ]);
        return (result.rows[0] as { total: number }).total;
    }

    async function inSystemContext<T>(fn: () => Promise<T>): Promise<T> {
        return harness.app.get(AppContext).run({ requestId: 'system', locale: 'pt-BR' }, fn);
    }

    function noticesOf(account: Account, kind: string): number {
        return publisher.ofType('usage.threshold.crossed').filter((message) => {
            const payload = message.payload as { kind: string };
            return payload.kind === kind && message.options?.jobId?.includes(account.company.id) === true;
        }).length;
    }

    it('assertRoom passa com folga e recusa sem restante ou com estimativa maior que o restante, com 429, resetsAt e o plano', async () => {
        const account = await harness.signUp('room');

        await withMeter(account, async (m) => m.assertRoom({ feature: 'ai', task: 'summary', estimateMicros: 1_000_000 }));
        await withMeter(account, async (m) => m.record(entry({ costMicros: 4_000_000 })));

        await expect(
            withMeter(account, async (m) => m.assertRoom({ feature: 'ai', task: 'summary', estimateMicros: 1_000_001 }))
        ).rejects.toMatchObject({ code: 'usage.cap_reached', status: 429, meta: { resetsAt: expect.any(String), plan: 'free' } });
        await withMeter(account, async (m) => m.assertRoom({ feature: 'ai', task: 'summary', estimateMicros: 1_000_000 }));
        await withMeter(account, async (m) => m.record(entry({ costMicros: 1_000_000 })));
        await expect(
            withMeter(account, async (m) => m.assertRoom({ feature: 'ai', task: 'summary', estimateMicros: 0 }))
        ).rejects.toMatchObject({ code: 'usage.cap_reached', status: 429 });
    });

    it('record repetido com a mesma referência lança uma vez só', async () => {
        const account = await harness.signUp('idempotent');
        const repeated: RecordUsageInput = entry({ costMicros: 500_000 });

        await withMeter(account, async (m) => m.record(repeated));
        await withMeter(account, async (m) => m.record(repeated));

        expect(await rows(account)).toBe(1);
        expect((await withMeter(account, async (m) => m.state())).usedMicros).toBe(500_000);
    });

    it('chamada sem resposta grava custo zero e não conta na cota', async () => {
        const account = await harness.signUp('unanswered');

        await withMeter(account, async (m) => m.record(entry({ costMicros: 900_000, outcome: 'unanswered' })));

        expect(await rows(account)).toBe(1);
        expect((await withMeter(account, async (m) => m.state())).usedMicros).toBe(0);
    });

    it('record acima do teto lança o custo real e pausa; GET /billing/me e /billing/usage mostram paused', async () => {
        const account = await harness.signUp('paused');
        await harness.inCompany(account.company.id, async () => {
            await harness.app
                .get(PlanContractService, { strict: false })
                .open('premium', { startsAt: new Date(), subscriptionId: crypto.randomUUID() });
        });
        const before = await harness.call<{ features: { ai: string }; usage: { state: string } }>(account.token, 'GET', '/billing/me');
        expect(before.body.usage.state).toBe('ok');

        await withMeter(account, async (m) => m.record(entry({ costMicros: 11_250_000 })));

        const me = await harness.call<{ features: { ai: string }; usage: { state: string; usedBps: number } }>(
            account.token,
            'GET',
            '/billing/me'
        );
        const usage = await harness.call<UsageBody>(account.token, 'GET', '/billing/usage');
        expect(me.body.features.ai).toBe('paused');
        expect(me.body.usage).toMatchObject({ state: 'paused', usedBps: 11250 });
        expect(usage.status).toBe(200);
        expect(usage.body).toMatchObject({
            state: 'paused',
            usedBps: 11250,
            capMicros: null,
            byFeature: { ai: { usedBps: 11250 }, whatsapp: { usedBps: 0 } }
        });
        expect(usage.body.resetsAt).toMatch(/^\d{4}-\d{2}-01T/);
        expect(noticesOf(account, 'paused')).toBe(1);
    });

    it('cruzar 80% manda um aviso só, mesmo com records em paralelo, e 100% manda um usage_paused só', async () => {
        const account = await harness.signUp('crossing');

        await Promise.all(
            [1, 2, 3].map(async () =>
                withMeter(account, async (m) => m.record(entry({ costMicros: 1_400_000, feature: 'whatsapp', task: 'reminder' })))
            )
        );

        expect(noticesOf(account, 'warning')).toBe(1);
        expect(noticesOf(account, 'paused')).toBe(0);
        const warning = publisher
            .ofType('usage.threshold.crossed')
            .find((message) => message.options?.jobId?.includes(account.company.id) === true);
        expect(warning?.options?.jobId).toMatch(/^usage-notice-.+-\d{4}-\d{2}-warning$/);

        await Promise.all([1, 2].map(async () => withMeter(account, async (m) => m.record(entry({ costMicros: 400_000 })))));

        expect(noticesOf(account, 'paused')).toBe(1);
        expect(noticesOf(account, 'warning')).toBe(1);
        const notices = await harness.pg.query('SELECT "kind" FROM "PaidUsageNotices" WHERE "companyId" = $1 ORDER BY "kind"', [
            account.company.id
        ]);
        expect(notices.rows).toEqual([{ kind: 'paused' }, { kind: 'warning' }]);
    });

    it('o handler do aviso manda o e-mail ao dono com o percentual e o mês', async () => {
        const account = await harness.signUp('mail');
        const mailer: MailerPort = harness.app.get(MailerPort, { strict: false });
        const enqueue = vi.spyOn(mailer, 'enqueue').mockResolvedValue(undefined);

        await inSystemContext(async () =>
            harness.app.get(UsageThresholdHandler, { strict: false }).handle({
                type: 'usage.threshold.crossed',
                requestId: 'r',
                companyId: account.company.id,
                occurredAt: new Date().toISOString(),
                trace: {},
                payload: { period: '2026-10', kind: 'warning', usedBps: 8500 }
            })
        );
        expect(enqueue).toHaveBeenCalledTimes(1);
        expect(enqueue).toHaveBeenCalledWith(
            expect.objectContaining({
                template: 'usage-warning',
                to: expect.objectContaining({ email: account.user.email }),
                props: expect.objectContaining({ percent: '85', month: 'outubro', resetMonth: 'novembro' })
            })
        );
        enqueue.mockRestore();
    });

    it('a virada do mês abre um período novo ok e libera as funções', async () => {
        const account = await harness.signUp('turn');
        await harness.inCompany(account.company.id, async () => {
            await harness.app
                .get(PlanContractService, { strict: false })
                .open('premium', { startsAt: new Date(), subscriptionId: crypto.randomUUID() });
        });
        const gate: PlanGateService = harness.app.get(PlanGateService, { strict: false });
        await withMeter(account, async (m) => m.record(entry({ costMicros: 10_000_000 })));
        const paused: UsageState = await withMeter(account, async (m) => m.state());
        expect(await harness.inCompany(account.company.id, async () => gate.stateOf('ai'))).toBe('paused');

        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(paused.resetsAt));
        const next: UsageState = await withMeter(account, async (m) => m.state());
        const feature = await harness.inCompany(account.company.id, async () => gate.stateOf('ai'));

        expect(next.period).not.toBe(paused.period);
        expect(next).toMatchObject({ state: 'ok', usedMicros: 0 });
        expect(feature).toBe('available');
    });

    it('o gasto de uma company não pausa a outra', async () => {
        const spender = await harness.signUp('spender');
        const bystander = await harness.signUp('bystander');

        await withMeter(spender, async (m) => m.record(entry({ costMicros: 5_000_000 })));

        expect((await withMeter(spender, async (m) => m.state())).state).toBe('paused');
        expect(await withMeter(bystander, async (m) => m.state())).toMatchObject({ state: 'ok', usedMicros: 0 });
        await withMeter(bystander, async (m) => m.assertRoom({ feature: 'ai', task: 'summary', estimateMicros: 100_000 }));
    });

    it('envio pago de template entra no mesmo razão pelo preço da tabela vezes o multiplicador', async () => {
        const account = await harness.signUp('send');
        const send: PaidSendMeter = harness.app.get(PaidSendMeter, { strict: false });

        await harness.inCompany(account.company.id, async () => {
            expect(await send.estimate('utility')).toBe(600_000);
            await send.record({ kind: 'whatsapp_template', category: 'utility', task: 'reminder', referenceId: 'wamid.utility' });
            await send.record({ kind: 'whatsapp_template', category: 'authentication', task: 'link-code', referenceId: 'wamid.auth' });
        });

        const lines = await harness.pg.query(
            'SELECT "feature", "referenceId", "costMicros", "providerCostMicros", "usdBrlRate", "detail" FROM "PaidUsageEntries" WHERE "companyId" = $1 ORDER BY "referenceId"',
            [account.company.id]
        );
        expect(lines.rows).toEqual([
            {
                feature: 'whatsapp',
                referenceId: 'wamid.auth',
                costMicros: '1000000',
                providerCostMicros: '500000',
                usdBrlRate: '5.0000',
                detail: { category: 'authentication' }
            },
            {
                feature: 'whatsapp',
                referenceId: 'wamid.utility',
                costMicros: '600000',
                providerCostMicros: '300000',
                usdBrlRate: null,
                detail: { category: 'utility' }
            }
        ]);
        expect((await harness.inCompany(account.company.id, async () => meter().state())).byFeature.whatsapp).toBe(3200);
    });

    it('nenhuma linha guarda texto livre: o detail só aceita as chaves fixas', async () => {
        const account = await harness.signUp('detail');

        await expect(
            withMeter(account, async (m) => m.record(entry({ detail: { prompt: 'meu saldo é 10 mil' } as never })))
        ).rejects.toMatchObject({ code: 'usage.invalid_detail' });
        await withMeter(account, async (m) => m.record(entry({ detail: { model: 'provider/model-1', inputTokens: 10, outputTokens: 5 } })));

        const stored = await harness.pg.query('SELECT "detail" FROM "PaidUsageEntries" WHERE "companyId" = $1', [account.company.id]);
        expect(stored.rows).toEqual([{ detail: { model: 'provider/model-1', inputTokens: 10, outputTokens: 5 } }]);
    });

    it('a exportação traz o agregado por mês e função, e o apagador e a exclusão da conta levam o razão', async () => {
        const account = await harness.signUp('lgpd');
        await withMeter(account, async (m) => m.record(entry({ costMicros: 200_000 })));
        await withMeter(account, async (m) => m.record(entry({ costMicros: 300_000, feature: 'whatsapp' })));
        await withMeter(account, async (m) => m.record(entry({ costMicros: 4_000_000 })));

        const exported = await inSystemContext(async () =>
            harness.app.get(UsageAccountExporter, { strict: false }).exportAll(account.company.id)
        );

        expect(exported).toEqual([
            expect.objectContaining({ feature: 'ai', costMicros: 4_200_000, entries: 2 }),
            expect.objectContaining({ feature: 'whatsapp', costMicros: 300_000, entries: 1 })
        ]);
        expect(await inSystemContext(async () => harness.app.get(UsageAccountEraser, { strict: false }).eraseAll(account.company.id))).toBe(
            4
        );
        expect(await rows(account)).toBe(0);

        const other = await harness.signUp('cascade');
        await withMeter(other, async (m) => m.record(entry()));
        await harness.pg.query('DELETE FROM "Companies" WHERE "id" = $1', [other.company.id]);
        const left = await harness.pg.query('SELECT count(*)::int AS total FROM "PaidUsageEntries" WHERE "companyId" = $1', [
            other.company.id
        ]);
        expect(left.rows[0]).toEqual({ total: 0 });
    });

    it('a limpeza apaga o que passou de 13 meses e o gauge conta as companies por estado', async () => {
        const account = await harness.signUp('maintenance');
        await withMeter(account, async (m) => m.record(entry({ costMicros: 4_100_000 })));
        await harness.pg.query(
            `INSERT INTO "PaidUsageEntries" ("id", "companyId", "period", "feature", "task", "referenceId", "costMicros", "outcome", "occurredAt")
             VALUES ($1, $2, '2024-01', 'ai', 'summary', 'old-1', 10, 'answered', now() - interval '14 months')`,
            [crypto.randomUUID(), account.company.id]
        );
        const application: UsageApplication = harness.app.get(UsageApplication, { strict: false });

        expect(await inSystemContext(async () => application.purgeExpired())).toBeGreaterThanOrEqual(1);
        const old = await harness.pg.query(`SELECT count(*)::int AS total FROM "PaidUsageEntries" WHERE "referenceId" = 'old-1'`);
        await inSystemContext(async () => application.publishGauge());

        expect(old.rows[0]).toEqual({ total: 0 });
        expect(
            harness.app.get(MetricsService, { strict: false }).gaugeValue('vera_paid_usage_companies', { state: 'paused' })
        ).toBeGreaterThanOrEqual(1);
    });
});

describe('paid usage (self_hosted, teto 0)', () => {
    let harness: AllocationHarness;

    beforeAll(async () => {
        process.env['DEPLOYMENT_MODE'] = 'self_hosted';
        process.env['PAID_USAGE_CAP_MICROS'] = '0';
        harness = await AllocationHarness.start('usage_self', new CapturingPublisher());
    });

    afterAll(async () => {
        delete process.env['DEPLOYMENT_MODE'];
        delete process.env['PAID_USAGE_CAP_MICROS'];
        await harness.stop();
    });

    it('teto 0 nunca pausa e nunca recusa', async () => {
        const account = await harness.signUp('uncapped');

        await harness.inCompany(account.company.id, async () => {
            const meter: PaidUsageMeter = harness.app.get(PaidUsageMeter, { strict: false });
            await meter.record(entry({ costMicros: 50_000_000 }));
            await meter.assertRoom({ feature: 'ai', task: 'summary', estimateMicros: 90_000_000 });
        });

        const usage = await harness.call<UsageBody>(account.token, 'GET', '/billing/usage');
        expect(usage.body).toMatchObject({ state: 'ok', usedBps: 0, capMicros: null });
    });
});

describe('paid usage (self_hosted, mesmo com PAID_USAGE_CAP_MICROS)', () => {
    let harness: AllocationHarness;

    beforeAll(async () => {
        process.env['DEPLOYMENT_MODE'] = 'self_hosted';
        process.env['PAID_USAGE_CAP_MICROS'] = '2000000';
        harness = await AllocationHarness.start('usage_self_cap', new CapturingPublisher());
    });

    afterAll(async () => {
        delete process.env['DEPLOYMENT_MODE'];
        delete process.env['PAID_USAGE_CAP_MICROS'];
        await harness.stop();
    });

    it('a auto-hospedada não tem cota: o gasto passa do valor da variável e o estado segue ok', async () => {
        const account = await harness.signUp('capped');

        await harness.inCompany(account.company.id, async () => {
            const meter: PaidUsageMeter = harness.app.get(PaidUsageMeter, { strict: false });
            await meter.record(entry({ costMicros: 5_000_000 }));
            await meter.assertRoom({ feature: 'ai', task: 'summary', estimateMicros: 5_000_000 });
        });

        const usage = await harness.call<UsageBody>(account.token, 'GET', '/billing/usage');
        expect(usage.body).toMatchObject({ state: 'ok', usedBps: 0, capMicros: null });
    });
});
