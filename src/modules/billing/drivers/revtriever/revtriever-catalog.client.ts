import { z } from 'zod';
import { BillingCatalogPort, CatalogPlan, CatalogPlanDraft, CatalogProduct, CatalogProductDraft } from '../../ports/billing-catalog.port';
import {
    revtrieverIntegrationSchema,
    revtrieverPlanListSchema,
    revtrieverPlanSchema,
    revtrieverPricingTestSchema,
    revtrieverProductListSchema,
    revtrieverProductSchema
} from '../../validation/revtriever-responses.schemas';
import { RevtrieverHttp } from './revtriever-http';

type PlanResponse = z.infer<typeof revtrieverPlanSchema>;

function planOf(response: PlanResponse): CatalogPlan {
    return { id: response.id, externalRef: response.externalRef, productId: response.productId };
}

function refQuery(externalRef: string): string {
    return new URLSearchParams({ externalRef }).toString();
}

export class RevtrieverCatalogClient extends BillingCatalogPort {
    public constructor(private readonly http: RevtrieverHttp) {
        super();
    }

    public async integrationOk(): Promise<boolean> {
        await this.http.request({ method: 'GET', path: '/v1/integration', schema: revtrieverIntegrationSchema });
        return true;
    }

    public async productByRef(externalRef: string): Promise<CatalogProduct | null> {
        const list: z.infer<typeof revtrieverProductListSchema> = await this.http.request({
            method: 'GET',
            path: `/v1/products?${refQuery(externalRef)}`,
            schema: revtrieverProductListSchema
        });
        return list.items.find((item: CatalogProduct): boolean => item.externalRef === externalRef) ?? null;
    }

    public async createProduct(draft: CatalogProductDraft): Promise<CatalogProduct> {
        return this.http.request({
            method: 'POST',
            path: '/v1/products',
            idempotencyKey: `vera-product-${draft.externalRef}`,
            schema: revtrieverProductSchema,
            body: {
                externalRef: draft.externalRef,
                name: draft.name,
                pricing: { mode: 'external', url: draft.pricingUrl, maxAmountCents: draft.priceCeilingCents }
            }
        });
    }

    public async testPricing(productId: string): Promise<boolean> {
        const result: z.infer<typeof revtrieverPricingTestSchema> = await this.http.request({
            method: 'POST',
            path: `/v1/products/${encodeURIComponent(productId)}/pricing-test`,
            body: {},
            schema: revtrieverPricingTestSchema
        });
        return result.ok;
    }

    public async planByRef(externalRef: string): Promise<CatalogPlan | null> {
        const list: z.infer<typeof revtrieverPlanListSchema> = await this.http.request({
            method: 'GET',
            path: `/v1/plans?${refQuery(externalRef)}`,
            schema: revtrieverPlanListSchema
        });
        const found: PlanResponse | undefined = list.items.find((item: PlanResponse): boolean => item.externalRef === externalRef);
        return found === undefined ? null : planOf(found);
    }

    public async createPlan(draft: CatalogPlanDraft): Promise<CatalogPlan> {
        const created: PlanResponse = await this.http.request({
            method: 'POST',
            path: '/v1/plans',
            idempotencyKey: `vera-plan-${draft.externalRef}`,
            schema: revtrieverPlanSchema,
            body: draft
        });
        return planOf(created);
    }

    public async updatePlan(id: string, draft: CatalogPlanDraft): Promise<CatalogPlan> {
        const updated: PlanResponse = await this.http.request({
            method: 'PUT',
            path: `/v1/plans/${encodeURIComponent(id)}`,
            schema: revtrieverPlanSchema,
            body: draft
        });
        return planOf(updated);
    }
}
