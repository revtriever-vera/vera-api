import { afterEach, describe, expect, it, vi } from 'vitest';
import { RevtrieverCatalogClient } from './revtriever-catalog.client';
import { RevtrieverHttp } from './revtriever-http';

function clientOf(): RevtrieverCatalogClient {
    return new RevtrieverCatalogClient(new RevtrieverHttp({ baseUrl: 'https://rv.invalid', apiKey: 'k', timeoutMs: 500, maxRetries: 0 }));
}

function stubJson(body: unknown): ReturnType<typeof vi.fn> {
    const fetchMock: ReturnType<typeof vi.fn> = vi
        .fn()
        .mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

function lastCall(fetchMock: ReturnType<typeof vi.fn>): [string, RequestInit] {
    return fetchMock.mock.calls[0] as [string, RequestInit];
}

describe('RevtrieverCatalogClient', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('confere a integração', async () => {
        const fetchMock = stubJson({ mode: 'test' });

        expect(await clientOf().integrationOk()).toBe(true);
        expect(lastCall(fetchMock)[0]).toBe('https://rv.invalid/v1/integration');
    });

    it('acha o produto pelo externalRef e ignora os de outro ref', async () => {
        const fetchMock = stubJson({
            items: [
                { id: 'p0', externalRef: 'outro' },
                { id: 'p1', externalRef: 'vera_premium' }
            ]
        });

        expect(await clientOf().productByRef('vera_premium')).toEqual({ id: 'p1', externalRef: 'vera_premium' });
        expect(lastCall(fetchMock)[0]).toBe('https://rv.invalid/v1/products?externalRef=vera_premium');

        stubJson({ items: [] });
        expect(await clientOf().productByRef('vera_premium')).toBeNull();
    });

    it('cria o produto com preço externo e teto, e roda o pricing-test', async () => {
        let fetchMock = stubJson({ id: 'p1', externalRef: 'vera_premium' });
        await clientOf().createProduct({
            externalRef: 'vera_premium',
            name: 'Vera Premium',
            pricingUrl: 'https://api.example.test/price',
            priceCeilingCents: 5000
        });
        expect(lastCall(fetchMock)[1].headers).toMatchObject({ 'idempotency-key': 'vera-product-vera_premium' });
        expect(JSON.parse(lastCall(fetchMock)[1].body as string)).toEqual({
            externalRef: 'vera_premium',
            name: 'Vera Premium',
            pricing: { mode: 'external', url: 'https://api.example.test/price', maxAmountCents: 5000 }
        });

        fetchMock = stubJson({ ok: false });
        expect(await clientOf().testPricing('p1')).toBe(false);
        expect(lastCall(fetchMock)[0]).toBe('https://rv.invalid/v1/products/p1/pricing-test');
    });

    it('acha, cria e atualiza o plano', async () => {
        stubJson({ items: [{ id: 'pl1', externalRef: 'vera_premium_monthly', productId: 'p1' }] });
        expect(await clientOf().planByRef('vera_premium_monthly')).toEqual({
            id: 'pl1',
            externalRef: 'vera_premium_monthly',
            productId: 'p1'
        });
        stubJson({ items: [] });
        expect(await clientOf().planByRef('vera_premium_monthly')).toBeNull();

        const draft = { externalRef: 'vera_premium_monthly', name: 'Vera Premium', productId: 'p1', interval: 'monthly' } as const;
        let fetchMock = stubJson({ id: 'pl1', externalRef: 'vera_premium_monthly', productId: 'p1' });
        await clientOf().createPlan(draft);
        expect(lastCall(fetchMock)[0]).toBe('https://rv.invalid/v1/plans');
        expect(lastCall(fetchMock)[1].method).toBe('POST');

        fetchMock = stubJson({ id: 'pl1', externalRef: 'vera_premium_monthly', productId: 'p2' });
        await clientOf().updatePlan('pl1', { ...draft, productId: 'p2' });
        expect(lastCall(fetchMock)[0]).toBe('https://rv.invalid/v1/plans/pl1');
        expect(lastCall(fetchMock)[1].method).toBe('PUT');
    });
});
