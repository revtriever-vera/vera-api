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
        const fetchMock = stubJson({ gateways: [{ connectionId: 'gw_1', provider: 'vindi' }] });

        expect(await clientOf().integrationOk()).toBe(true);
        expect(lastCall(fetchMock)[0]).toBe('https://rv.invalid/v1/integration');
    });

    it('acha o produto varrendo as páginas pelo externalRef e ignora os de outro ref', async () => {
        const pagination = { page: 1, pageSize: 100, totalRecords: 2, totalPages: 1 };
        const fetchMock = stubJson({
            data: [
                { id: 'p0', externalRef: null },
                { id: 'p1', externalRef: 'vera_premium' }
            ],
            pagination
        });

        expect(await clientOf().productByRef('vera_premium')).toEqual({ id: 'p1', externalRef: 'vera_premium' });
        expect(lastCall(fetchMock)[0]).toBe('https://rv.invalid/v1/products?page=1&pageSize=100');

        stubJson({ data: [], pagination });
        expect(await clientOf().productByRef('vera_premium')).toBeNull();
    });

    it('segue para a página seguinte até achar o produto', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        data: [{ id: 'p0', externalRef: 'a' }],
                        pagination: { page: 1, pageSize: 100, totalRecords: 101, totalPages: 2 }
                    })
                )
            )
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        data: [{ id: 'p1', externalRef: 'vera_premium' }],
                        pagination: { page: 2, pageSize: 100, totalRecords: 101, totalPages: 2 }
                    })
                )
            );
        vi.stubGlobal('fetch', fetchMock);

        expect(await clientOf().productByRef('vera_premium')).toEqual({ id: 'p1', externalRef: 'vera_premium' });
        expect(fetchMock.mock.calls[1]?.[0]).toBe('https://rv.invalid/v1/products?page=2&pageSize=100');
    });

    it('cria o produto com preço por endpoint e teto, e roda o pricing-test', async () => {
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
            pricing: { mode: 'endpoint', url: 'https://api.example.test/price', capCents: 5000 }
        });

        fetchMock = stubJson({ outcome: 'http_error', amountCents: null, responseStatus: 500 });
        expect(await clientOf().testPricing('p1')).toBe(false);
        expect(lastCall(fetchMock)[0]).toBe('https://rv.invalid/v1/products/p1/pricing-test');

        stubJson({ outcome: 'ok', amountCents: 1490 });
        expect(await clientOf().testPricing('p1')).toBe(true);
    });

    it('acha o plano pelo nome (sem arquivados), lê o produto no detalhe, cria e atualiza', async () => {
        const pagination = { page: 1, pageSize: 100, totalRecords: 2, totalPages: 1 };
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        data: [
                            { id: 'old', name: 'vera_premium_monthly', archivedAt: '2026-01-01T00:00:00.000Z' },
                            { id: 'pl1', name: 'vera_premium_monthly', archivedAt: null }
                        ],
                        pagination
                    })
                )
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ id: 'pl1', name: 'vera_premium_monthly', archivedAt: null, items: [{ productId: 'p1' }] }))
            );
        vi.stubGlobal('fetch', fetchMock);
        expect(await clientOf().planByRef('vera_premium_monthly')).toEqual({
            id: 'pl1',
            externalRef: 'vera_premium_monthly',
            productId: 'p1'
        });
        expect(fetchMock.mock.calls[1]?.[0]).toBe('https://rv.invalid/v1/plans/pl1');

        stubJson({ data: [], pagination: { page: 1, pageSize: 100, totalRecords: 0, totalPages: 0 } });
        expect(await clientOf().planByRef('vera_premium_monthly')).toBeNull();

        const draft = { externalRef: 'vera_premium_monthly', name: 'Vera Premium', productId: 'p1', interval: 'monthly' } as const;
        const planResponse = { id: 'pl1', name: 'vera_premium_monthly', archivedAt: null, items: [{ productId: 'p1' }] };
        let created = stubJson(planResponse);
        await clientOf().createPlan(draft);
        expect(lastCall(created)[0]).toBe('https://rv.invalid/v1/plans');
        expect(lastCall(created)[1].method).toBe('POST');
        expect(JSON.parse(lastCall(created)[1].body as string)).toEqual({
            name: 'vera_premium_monthly',
            periodMonths: 1,
            defaultPaymentMethod: 'card',
            maxInstallments: 1,
            items: [{ productId: 'p1', discounts: [] }]
        });

        created = stubJson({ ...planResponse, items: [{ productId: 'p2' }] });
        expect(await clientOf().updatePlan('pl1', { ...draft, productId: 'p2' })).toMatchObject({ productId: 'p2' });
        expect(lastCall(created)[0]).toBe('https://rv.invalid/v1/plans/pl1');
        expect(lastCall(created)[1].method).toBe('PUT');
    });
});
