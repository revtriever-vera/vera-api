import { describe, expect, it } from 'vitest';
import { FakeBillingCatalog } from '../drivers/fake-billing-catalog';
import { PREMIUM_PLAN_REF, PREMIUM_PRODUCT_REF, provisionCatalog, ProvisionSettings } from './billing-catalog-provisioner';

const SETTINGS: ProvisionSettings = { priceEndpointUrl: 'https://api.example.test/billing/revtriever/price', priceCeilingCents: 5000 };

describe('provisionCatalog', () => {
    it('cria produto e plano na primeira rodada e devolve o mesmo planId na segunda', async () => {
        const catalog = new FakeBillingCatalog();

        const first = await provisionCatalog(catalog, SETTINGS);
        const second = await provisionCatalog(catalog, SETTINGS);

        expect(first).toMatchObject({ createdProduct: true, createdPlan: true, publishedVersion: false });
        expect(second).toMatchObject({ createdProduct: false, createdPlan: false, publishedVersion: false });
        expect(second.planId).toBe(first.planId);
        expect(second.productId).toBe(first.productId);
        expect(await catalog.productByRef(PREMIUM_PRODUCT_REF)).not.toBeNull();
        expect(await catalog.planByRef(PREMIUM_PLAN_REF)).toMatchObject({ id: first.planId, productId: first.productId });
    });

    it('recusa criar o produto sem endpoint de preço ou sem teto, mas confere um existente sem eles', async () => {
        const catalog = new FakeBillingCatalog();

        await expect(provisionCatalog(catalog, { priceEndpointUrl: null, priceCeilingCents: 5000 })).rejects.toThrow(
            'BILLING_PRICE_ENDPOINT_URL'
        );
        await expect(provisionCatalog(catalog, { priceEndpointUrl: SETTINGS.priceEndpointUrl, priceCeilingCents: null })).rejects.toThrow(
            'BILLING_PRICE_CEILING_CENTS'
        );

        await provisionCatalog(catalog, SETTINGS);
        await expect(provisionCatalog(catalog, { priceEndpointUrl: null, priceCeilingCents: null })).resolves.toMatchObject({
            createdProduct: false
        });
    });

    it('falha quando o teste de preço do produto falha', async () => {
        const catalog = new FakeBillingCatalog();
        catalog.testPricing = async (): Promise<boolean> => false;

        await expect(provisionCatalog(catalog, SETTINGS)).rejects.toThrow('teste de preço');
    });

    it('publica versão nova do plano quando o produto mudou, mantendo o planId', async () => {
        const catalog = new FakeBillingCatalog();
        const first = await provisionCatalog(catalog, SETTINGS);
        await catalog.createProduct({ externalRef: 'x', name: 'x', pricingUrl: 'https://a.test', priceCeilingCents: 1 });
        const original = catalog.productByRef.bind(catalog);
        catalog.productByRef = async (ref: string) =>
            ref === PREMIUM_PRODUCT_REF ? { id: 'fake_prod_novo', externalRef: ref } : original(ref);

        const second = await provisionCatalog(catalog, SETTINGS);

        expect(second).toMatchObject({ createdPlan: false, publishedVersion: true, productId: 'fake_prod_novo' });
        expect(second.planId).toBe(first.planId);
        expect(catalog.publishedVersions).toBe(1);
    });
});
