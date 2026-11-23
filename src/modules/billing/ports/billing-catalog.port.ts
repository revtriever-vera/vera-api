export interface CatalogProduct {
    readonly id: string;
    readonly externalRef: string;
}

export interface CatalogPlan {
    readonly id: string;
    readonly externalRef: string;
    readonly productId: string;
}

export interface CatalogProductDraft {
    readonly externalRef: string;
    readonly name: string;
    readonly pricingUrl: string;
    readonly priceCeilingCents: number;
}

export interface CatalogPlanDraft {
    readonly externalRef: string;
    readonly name: string;
    readonly productId: string;
    readonly interval: 'monthly';
}

export abstract class BillingCatalogPort {
    public abstract integrationOk(): Promise<boolean>;
    public abstract productByRef(externalRef: string): Promise<CatalogProduct | null>;
    public abstract createProduct(draft: CatalogProductDraft): Promise<CatalogProduct>;
    public abstract testPricing(productId: string): Promise<boolean>;
    public abstract planByRef(externalRef: string): Promise<CatalogPlan | null>;
    public abstract createPlan(draft: CatalogPlanDraft): Promise<CatalogPlan>;
    public abstract updatePlan(id: string, draft: CatalogPlanDraft): Promise<CatalogPlan>;
}
