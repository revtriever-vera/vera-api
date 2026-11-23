import { z } from 'zod';
import { BillingCatalogPort, CatalogPlan, CatalogPlanDraft, CatalogProduct, CatalogProductDraft } from '../../ports/billing-catalog.port';
import {
    revtrieverIntegrationSchema,
    revtrieverPlanPageSchema,
    revtrieverPlanSchema,
    revtrieverPricingTestSchema,
    revtrieverProductPageSchema,
    revtrieverProductSchema
} from '../../validation/revtriever-responses.schemas';
import { RevtrieverHttp } from './revtriever-http';

const PAGE_SIZE: number = 100;

type PlanResponse = z.infer<typeof revtrieverPlanSchema>;
type ProductResponse = z.infer<typeof revtrieverProductSchema>;

function productOf(response: ProductResponse, externalRef: string): CatalogProduct {
    return { id: response.id, externalRef: response.externalRef ?? externalRef };
}

function planOf(response: PlanResponse): CatalogPlan {
    return { id: response.id, externalRef: response.name, productId: response.items[0]?.productId ?? '' };
}

function planBody(draft: CatalogPlanDraft): unknown {
    return {
        name: draft.externalRef,
        periodMonths: 1,
        defaultPaymentMethod: 'card',
        maxInstallments: 1,
        items: [{ productId: draft.productId, discounts: [] }]
    };
}

/**
 * A API da Revtriever não filtra produtos nem planos por referência e o plano não guarda `externalRef`: o produto é achado
 * varrendo o catálogo pelo `externalRef`; o plano, pelo nome, que a Vera grava igual à referência.
 */
export class RevtrieverCatalogClient extends BillingCatalogPort {
    public constructor(private readonly http: RevtrieverHttp) {
        super();
    }

    public async integrationOk(): Promise<boolean> {
        await this.http.request({ method: 'GET', path: '/v1/integration', schema: revtrieverIntegrationSchema });
        return true;
    }

    public async productByRef(externalRef: string): Promise<CatalogProduct | null> {
        for (let page: number = 1; ; page += 1) {
            const result: z.infer<typeof revtrieverProductPageSchema> = await this.http.request({
                method: 'GET',
                path: `/v1/products?page=${String(page)}&pageSize=${String(PAGE_SIZE)}`,
                schema: revtrieverProductPageSchema
            });
            const found: ProductResponse | undefined = result.data.find(
                (item: ProductResponse): boolean => item.externalRef === externalRef
            );
            if (found !== undefined) {
                return productOf(found, externalRef);
            }
            if (page >= result.pagination.totalPages) {
                return null;
            }
        }
    }

    public async createProduct(draft: CatalogProductDraft): Promise<CatalogProduct> {
        const created: ProductResponse = await this.http.request({
            method: 'POST',
            path: '/v1/products',
            idempotencyKey: `vera-product-${draft.externalRef}`,
            schema: revtrieverProductSchema,
            body: {
                name: draft.name,
                externalRef: draft.externalRef,
                pricing: { mode: 'endpoint', url: draft.pricingUrl, capCents: draft.priceCeilingCents }
            }
        });
        return productOf(created, draft.externalRef);
    }

    public async testPricing(productId: string): Promise<boolean> {
        const result: z.infer<typeof revtrieverPricingTestSchema> = await this.http.request({
            method: 'POST',
            path: `/v1/products/${encodeURIComponent(productId)}/pricing-test`,
            body: {},
            schema: revtrieverPricingTestSchema
        });
        return result.outcome === 'ok';
    }

    public async planByRef(externalRef: string): Promise<CatalogPlan | null> {
        for (let page: number = 1; ; page += 1) {
            const result: z.infer<typeof revtrieverPlanPageSchema> = await this.http.request({
                method: 'GET',
                path: `/v1/plans?page=${String(page)}&pageSize=${String(PAGE_SIZE)}`,
                schema: revtrieverPlanPageSchema
            });
            const found: { readonly id: string } | undefined = result.data.find(
                (item: { name: string; archivedAt: string | null }): boolean => item.name === externalRef && item.archivedAt === null
            );
            if (found !== undefined) {
                return planOf(await this.planDetail(found.id));
            }
            if (page >= result.pagination.totalPages) {
                return null;
            }
        }
    }

    public async createPlan(draft: CatalogPlanDraft): Promise<CatalogPlan> {
        const created: PlanResponse = await this.http.request({
            method: 'POST',
            path: '/v1/plans',
            idempotencyKey: `vera-plan-${draft.externalRef}`,
            schema: revtrieverPlanSchema,
            body: planBody(draft)
        });
        return planOf(created);
    }

    public async updatePlan(id: string, draft: CatalogPlanDraft): Promise<CatalogPlan> {
        const updated: PlanResponse = await this.http.request({
            method: 'PUT',
            path: `/v1/plans/${encodeURIComponent(id)}`,
            schema: revtrieverPlanSchema,
            body: planBody(draft)
        });
        return planOf(updated);
    }

    private async planDetail(id: string): Promise<PlanResponse> {
        return this.http.request({ method: 'GET', path: `/v1/plans/${encodeURIComponent(id)}`, schema: revtrieverPlanSchema });
    }
}
