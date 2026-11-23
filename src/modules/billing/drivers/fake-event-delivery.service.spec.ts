import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseBillingConfig } from '../config/billing.config';
import { EngineEvent } from '../domain/billing-engine.types';
import { BillingLogService } from '../services/billing-log.service';
import { FakeEventDelivery, signatureOf } from './fake-event-delivery.service';

const EVENT: EngineEvent = { id: 'fake_evt_000001', type: 'invoice.paid', createdAt: '2026-12-01T00:00:00Z', data: { invoiceId: 'i' } };

function build(extra: NodeJS.ProcessEnv): { delivery: FakeEventDelivery; failed: ReturnType<typeof vi.fn> } {
    const failed: ReturnType<typeof vi.fn> = vi.fn();
    const delivery: FakeEventDelivery = new FakeEventDelivery(parseBillingConfig({ IS_LOCAL: 'true', ...extra }), {
        fakeDeliveryFailed: failed
    } as unknown as BillingLogService);
    return { delivery, failed };
}

describe('FakeEventDelivery', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('sem URL configurada não entrega nada', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await build({}).delivery.deliver(EVENT);

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('assina "t.corpo" com HMAC-SHA256 no formato t=<unix>,v1=<hex>', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-12-01T00:00:00Z'));
        const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        await build({
            FAKE_BILLING_WEBHOOK_URL: 'http://localhost:3333/hook',
            FAKE_BILLING_WEBHOOK_SECRET: 'segredo-de-teste-1234'
        }).delivery.deliver(EVENT);

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        const timestamp: number = Date.parse('2026-12-01T00:00:00Z') / 1000;
        const expected: string = createHmac('sha256', 'segredo-de-teste-1234')
            .update(`${String(timestamp)}.${init.body as string}`)
            .digest('hex');
        expect(url).toBe('http://localhost:3333/hook');
        expect(init.headers).toMatchObject({ 'x-revtriever-signature': `t=${String(timestamp)},v1=${expected}` });
        expect(JSON.parse(init.body as string)).toEqual(EVENT);
        expect(signatureOf('segredo-de-teste-1234', timestamp, init.body as string)).toBe(`t=${String(timestamp)},v1=${expected}`);
    });

    it('registra e segue quando o webhook responde erro ou está fora do ar', async () => {
        const { delivery, failed } = build({ FAKE_BILLING_WEBHOOK_URL: 'http://localhost:3333/hook' });
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValueOnce(new Response(null, { status: 401 }))
                .mockRejectedValueOnce(new Error('down'))
        );

        await delivery.deliver(EVENT);
        await delivery.deliver(EVENT);

        expect(failed.mock.calls).toEqual([
            ['invoice.paid', 'status_401'],
            ['invoice.paid', 'unreachable']
        ]);
    });
});
