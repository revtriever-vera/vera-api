import { describe, expect, it } from 'vitest';
import { parseBillingConfig } from '../config/billing.config';
import { BillingEnginePort } from '../ports/billing-engine.port';
import { BillingLogService } from '../services/billing-log.service';
import { BillingMetricsService } from '../services/billing-metrics.service';
import { billingCatalogFactory, billingEngineFactory } from './billing-engine.factory';
import { FakeBillingCatalog } from './fake-billing-catalog';
import { FakeBillingEngineDriver } from './fake-billing-engine.driver';
import { ObservedBillingEngine } from './observed-billing-engine';
import { RevtrieverBillingEngineDriver } from './revtriever/revtriever-billing-engine.driver';
import { RevtrieverCatalogClient } from './revtriever/revtriever-catalog.client';

const FAKE = { engine: 'fake' } as unknown as FakeBillingEngineDriver;
const REVTRIEVER = { engine: 'revtriever' } as unknown as RevtrieverBillingEngineDriver;
const LOGS = {} as BillingLogService;
const METRICS = {} as BillingMetricsService;

describe('billingEngineFactory', () => {
    it('escolhe o fake pelo BILLING_ENGINE_DRIVER e embrulha no observado', () => {
        const engine: BillingEnginePort = billingEngineFactory(parseBillingConfig({ IS_LOCAL: 'true' }), FAKE, REVTRIEVER, LOGS, METRICS);

        expect(engine).toBeInstanceOf(ObservedBillingEngine);
        expect(engine.engine).toBe('fake');
    });

    it('escolhe o revtriever quando a variável pede', () => {
        const config = parseBillingConfig({ IS_LOCAL: 'true', BILLING_ENGINE_DRIVER: 'revtriever' });

        expect(billingEngineFactory(config, FAKE, REVTRIEVER, LOGS, METRICS).engine).toBe('revtriever');
    });

    it('fora do local nunca escolhe o fake, nem pedindo', () => {
        for (const env of [{ IS_LOCAL: 'false' }, { IS_LOCAL: 'false', BILLING_ENGINE_DRIVER: 'fake' }]) {
            expect(billingEngineFactory(parseBillingConfig(env), FAKE, REVTRIEVER, LOGS, METRICS).engine).toBe('revtriever');
        }
    });

    it('usa o fake de verdade quando o fake é o escolhido', () => {
        expect(FakeBillingEngineDriver).toBeDefined();
        expect(RevtrieverBillingEngineDriver).toBeDefined();
    });
});

describe('billingCatalogFactory', () => {
    it('devolve o catálogo em memória com o fake', () => {
        expect(billingCatalogFactory(parseBillingConfig({ IS_LOCAL: 'true' }))).toBeInstanceOf(FakeBillingCatalog);
    });

    it('devolve o cliente HTTP com o revtriever e chave', () => {
        const config = parseBillingConfig({ IS_LOCAL: 'true', BILLING_ENGINE_DRIVER: 'revtriever', REVTRIEVER_API_KEY: 'rk_x' });

        expect(billingCatalogFactory(config)).toBeInstanceOf(RevtrieverCatalogClient);
    });

    it('recusa o revtriever sem chave', () => {
        const config = parseBillingConfig({ IS_LOCAL: 'true', BILLING_ENGINE_DRIVER: 'revtriever' });

        expect(() => billingCatalogFactory(config)).toThrow('REVTRIEVER_API_KEY');
    });
});
