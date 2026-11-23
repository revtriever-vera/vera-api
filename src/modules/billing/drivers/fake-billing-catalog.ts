import { BillingCatalogPort, CatalogPlan, CatalogPlanDraft, CatalogProduct, CatalogProductDraft } from '../ports/billing-catalog.port';

export class FakeBillingCatalog extends BillingCatalogPort {
    private readonly products: Map<string, CatalogProduct> = new Map<string, CatalogProduct>();
    private readonly plans: Map<string, CatalogPlan> = new Map<string, CatalogPlan>();
    private versions: number = 0;

    public async integrationOk(): Promise<boolean> {
        return true;
    }

    public async productByRef(externalRef: string): Promise<CatalogProduct | null> {
        return this.products.get(externalRef) ?? null;
    }

    public async createProduct(draft: CatalogProductDraft): Promise<CatalogProduct> {
        const product: CatalogProduct = {
            id: `fake_prod_${String(this.products.size + 1).padStart(3, '0')}`,
            externalRef: draft.externalRef
        };
        this.products.set(draft.externalRef, product);
        return product;
    }

    public async testPricing(): Promise<boolean> {
        return true;
    }

    public async planByRef(externalRef: string): Promise<CatalogPlan | null> {
        return this.plans.get(externalRef) ?? null;
    }

    public async createPlan(draft: CatalogPlanDraft): Promise<CatalogPlan> {
        const plan: CatalogPlan = {
            id: `fake_plan_${String(this.plans.size + 1).padStart(3, '0')}`,
            externalRef: draft.externalRef,
            productId: draft.productId
        };
        this.plans.set(draft.externalRef, plan);
        return plan;
    }

    public async updatePlan(id: string, draft: CatalogPlanDraft): Promise<CatalogPlan> {
        this.versions += 1;
        const plan: CatalogPlan = { id, externalRef: draft.externalRef, productId: draft.productId };
        this.plans.set(draft.externalRef, plan);
        return plan;
    }

    public get publishedVersions(): number {
        return this.versions;
    }
}
