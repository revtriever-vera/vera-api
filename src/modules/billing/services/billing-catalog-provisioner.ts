import { BillingCatalogPort, CatalogPlan, CatalogPlanDraft, CatalogProduct } from '../ports/billing-catalog.port';

export const PREMIUM_PRODUCT_REF: string = 'vera_premium';
export const PREMIUM_PLAN_REF: string = 'vera_premium_monthly';
const PREMIUM_NAME: string = 'Vera Premium';

export interface ProvisionSettings {
    readonly priceEndpointUrl: string | null;
    readonly priceCeilingCents: number | null;
}

export interface ProvisionResult {
    readonly planId: string;
    readonly productId: string;
    readonly createdProduct: boolean;
    readonly createdPlan: boolean;
    readonly publishedVersion: boolean;
}

interface ProductOutcome {
    readonly product: CatalogProduct;
    readonly created: boolean;
}

async function ensureProduct(catalog: BillingCatalogPort, settings: ProvisionSettings): Promise<ProductOutcome> {
    const existing: CatalogProduct | null = await catalog.productByRef(PREMIUM_PRODUCT_REF);
    if (existing !== null) {
        return { product: existing, created: false };
    }
    if (settings.priceEndpointUrl === null || settings.priceCeilingCents === null) {
        throw new Error('BILLING_PRICE_ENDPOINT_URL e BILLING_PRICE_CEILING_CENTS são obrigatórios para criar o produto');
    }
    const product: CatalogProduct = await catalog.createProduct({
        externalRef: PREMIUM_PRODUCT_REF,
        name: PREMIUM_NAME,
        pricingUrl: settings.priceEndpointUrl,
        priceCeilingCents: settings.priceCeilingCents
    });
    if (!(await catalog.testPricing(product.id))) {
        throw new Error('o teste de preço do produto falhou: confira o endpoint de preço');
    }
    return { product, created: true };
}

export async function provisionCatalog(catalog: BillingCatalogPort, settings: ProvisionSettings): Promise<ProvisionResult> {
    await catalog.integrationOk();
    const { product, created }: ProductOutcome = await ensureProduct(catalog, settings);
    const draft: CatalogPlanDraft = { externalRef: PREMIUM_PLAN_REF, name: PREMIUM_NAME, productId: product.id, interval: 'monthly' };
    const existing: CatalogPlan | null = await catalog.planByRef(PREMIUM_PLAN_REF);
    if (existing === null) {
        const plan: CatalogPlan = await catalog.createPlan(draft);
        return { planId: plan.id, productId: product.id, createdProduct: created, createdPlan: true, publishedVersion: false };
    }
    if (existing.productId === product.id) {
        return { planId: existing.id, productId: product.id, createdProduct: created, createdPlan: false, publishedVersion: false };
    }
    const updated: CatalogPlan = await catalog.updatePlan(existing.id, draft);
    return { planId: updated.id, productId: product.id, createdProduct: created, createdPlan: false, publishedVersion: true };
}
