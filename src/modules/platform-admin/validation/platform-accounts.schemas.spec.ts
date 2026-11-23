import { describe, expect, it } from 'vitest';
import { redactSecrets } from '../../identity/services/platform-account-redaction';
import { accountBillingSchema, accountDataSchema } from './platform-accounts.schemas';

const AT: Date = new Date('2026-01-10T12:00:00.000Z');

function throughRedactionAndJson(value: unknown): unknown {
    return JSON.parse(JSON.stringify(redactSecrets(value)));
}

describe('platform account schemas against what the exporters emit', () => {
    it('accepts billing once card data is redacted and dates are serialized', () => {
        const exported: unknown = {
            subscriptions: [
                {
                    id: '0197c8a0-0000-7000-8000-000000000001',
                    status: 'active',
                    paymentMethod: 'card',
                    paidThrough: AT,
                    firstPaidAt: AT,
                    canceledAt: null,
                    cardBrand: 'visa',
                    cardLast4: '4242',
                    createdAt: AT
                }
            ],
            invoices: [
                {
                    id: '0197c8a0-0000-7000-8000-000000000002',
                    status: 'paid',
                    totalCents: 1990,
                    method: 'card',
                    dueDate: AT,
                    cycleStart: AT,
                    cycleEnd: AT,
                    paidAt: AT
                }
            ]
        };

        const parsed = accountBillingSchema.parse(throughRedactionAndJson(exported));

        expect(parsed?.subscriptions[0]).not.toHaveProperty('cardBrand');
        expect(parsed?.invoices[0]?.totalCents).toBe(1990);
    });

    it('accepts bank connections without the keys the redaction removes', () => {
        const exported: unknown = {
            credentials: { configured: true, clientIdHint: 'ab12', status: 'active' },
            connections: [
                { connectorName: 'Banco', itemIdHint: 'cd34', status: 'connected', createdAt: AT.toISOString(), lastSuccessAt: null }
            ]
        };

        const redacted: unknown = throughRedactionAndJson(exported);
        const schema = accountDataSchema.shape.bank_connections;

        expect(schema.parse(redacted).connections).toHaveLength(1);
        expect(redacted).not.toHaveProperty('credentials');
    });
});
