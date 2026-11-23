import { execFile } from 'node:child_process';
import { AddressInfo, Server } from 'node:net';
import { promisify } from 'node:util';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';
import { AppModule } from '../../src/app.module';
import { billingConfig, parseBillingConfig } from '../../src/modules/billing/config/billing.config';
import { BillingEnginePort } from '../../src/modules/billing/ports/billing-engine.port';
import { AllocationHarness } from './support/allocation-harness';
import { createIsolatedDatabase, IsolatedDatabase } from './support/isolated-database';
import { isolateRedisForWorker } from './support/queue';

const run = promisify(execFile);

function originOf(app: INestApplication): string {
    return `http://127.0.0.1:${String(((app.getHttpServer() as Server).address() as AddressInfo).port)}`;
}

async function get(origin: string, path: string): Promise<Response> {
    const response: Response = await fetch(`${origin}${path}`, { redirect: 'manual' });
    await response.body?.cancel();
    return response;
}

describe('motor de cobrança: driver fake', () => {
    let harness: AllocationHarness;

    beforeAll(async () => {
        harness = await AllocationHarness.start('billing_engine');
    });

    afterAll(async () => {
        await harness.stop();
    });

    it('a aplicação sobe com o motor injetável e o driver fake como padrão no local', () => {
        expect(harness.app.get(BillingEnginePort).engine).toBe('fake');
    });

    it('captura de cartão pela página de dev: volta para o app com card=saved e o cartão fica salvo', async () => {
        const engine: BillingEnginePort = harness.app.get(BillingEnginePort);
        const subscription = await engine.createSubscription({
            idempotencyKey: 'int-capture-1',
            planId: 'plan-int',
            customer: { externalRef: 'company-int', name: 'Empresa', email: 'dono@example.test' },
            paymentMethod: 'card'
        });
        const session = await engine.createCardCaptureSession(subscription.id, 'https://app.example.test/settings/plan', 'key-1');

        const response: Response = await get(originOf(harness.app), new URL(session.captureUrl).pathname);

        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe('https://app.example.test/settings/plan?card=saved');
        expect(await engine.savedCardOf(subscription.id)).toEqual({ brand: 'visa', last4: '4242' });
        expect((await engine.subscriptionOf(subscription.id)).status).toBe('active');
    });

    it('pagamento pela página de dev marca a fatura como paga', async () => {
        const engine: BillingEnginePort = harness.app.get(BillingEnginePort);
        const subscription = await engine.createSubscription({
            idempotencyKey: 'int-pix-1',
            planId: 'plan-int',
            customer: { externalRef: 'company-int-pix', name: 'Empresa', email: 'dono@example.test' },
            paymentMethod: 'pix'
        });
        const invoice = (await engine.invoicesWithStatus('issued', 1)).items.find((item) => item.subscriptionId === subscription.id);
        const link = await engine.invoicePaymentLinkOf(invoice?.id ?? '');

        const response: Response = await get(originOf(harness.app), new URL(link.url).pathname);

        expect(response.status).toBe(200);
        expect((await engine.invoiceOf(invoice?.id ?? '')).status).toBe('paid');
    });

    it('token de captura e fatura desconhecidos respondem 404', async () => {
        const origin: string = originOf(harness.app);

        expect((await get(origin, '/billing/_dev/capture/inexistente')).status).toBe(404);
        expect((await get(origin, '/billing/_dev/pay/inexistente')).status).toBe(404);
    });
});

describe('motor de cobrança: páginas de dev fora do local', () => {
    let app: INestApplication;
    let database: IsolatedDatabase;

    beforeAll(async () => {
        database = await createIsolatedDatabase('billing_dev_off');
        process.env['DATABASE_URL'] = database.url;
        await isolateRedisForWorker(inject('redisNode'));
        process.env['NODE_ENV'] = 'test';
        process.env['IS_LOCAL'] = 'true';
        process.env['DEPLOY_ENV'] = 'local';
        const settings = { ...parseBillingConfig({ IS_LOCAL: 'false', DEPLOYMENT_MODE: 'hosted', BILLING_ENGINE_DRIVER: 'fake' }) };
        const testing: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(billingConfig.KEY)
            .useValue(settings)
            .compile();
        app = testing.createNestApplication();
        await app.init();
        await app.listen(0);
    });

    afterAll(async () => {
        await app.close();
        await database.drop();
    });

    it('respondem 404 com o fake ligado mas sem IS_LOCAL', async () => {
        const origin: string = originOf(app);

        expect((await get(origin, '/billing/_dev/capture/qualquer')).status).toBe(404);
        expect((await get(origin, '/billing/_dev/pay/qualquer')).status).toBe(404);
    });
});

describe('npm run billing:provision contra o fake', () => {
    async function provision(): Promise<string> {
        const { stdout } = await run('npx', ['tsx', 'scripts/billing-provision.ts'], {
            env: {
                PATH: process.env['PATH'],
                HOME: process.env['HOME'],
                IS_LOCAL: 'true',
                BILLING_ENGINE_DRIVER: 'fake',
                BILLING_PRICE_ENDPOINT_URL: 'https://api.example.test/billing/revtriever/price',
                BILLING_PRICE_CEILING_CENTS: '5000'
            }
        });
        return stdout;
    }

    it('cria produto e plano e devolve o mesmo planId na segunda rodada', async () => {
        const first: string = await provision();
        const second: string = await provision();

        const planOf = (output: string): string | undefined => /REVTRIEVER_PLAN_ID=(\S+)/.exec(output)?.[1];
        expect(first).toContain('produto: criado');
        expect(first).toContain('plano: criado');
        expect(planOf(first)).toBeDefined();
        expect(planOf(second)).toBe(planOf(first));
    }, 120_000);
});
