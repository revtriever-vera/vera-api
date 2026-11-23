import { describe, expect, it } from 'vitest';
import { WebhookBody, webhookBodySchema } from '../validation/whatsapp-webhook.schemas';
import { inboundMessagesOf, statusUpdatesOf } from './inbound.mapper';

function bodyOf(value: Record<string, unknown>): WebhookBody {
    return webhookBodySchema.parse({
        object: 'whatsapp_business_account',
        entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'phone-1' }, ...value } }] }]
    });
}

describe('inboundMessagesOf', () => {
    it('mapeia texto, botão, resposta interativa e trata o resto como não suportado', () => {
        const body: WebhookBody = bodyOf({
            messages: [
                { from: '1', id: 'w1', timestamp: '1700000000', type: 'text', text: { body: 'oi' }, context: { id: 'w0' } },
                { from: '1', id: 'w2', timestamp: '1700000001', type: 'button', button: { payload: 'rem:done:1' } },
                { from: '1', id: 'w3', timestamp: '1700000002', type: 'interactive', interactive: { list_reply: { id: 'cal:confirm:t' } } },
                { from: '1', id: 'w4', timestamp: '1700000003', type: 'image' }
            ]
        });

        const messages = inboundMessagesOf(body);

        expect(messages.map((message) => message.kind)).toEqual(['text', 'button', 'button', 'unsupported']);
        expect(messages[0]).toMatchObject({ wamid: 'w1', text: 'oi', contextWamid: 'w0', phoneNumberId: 'phone-1' });
        expect(messages[2]?.buttonPayload).toBe('cal:confirm:t');
        expect(messages[0]?.timestamp.toISOString()).toBe('2023-11-14T22:13:20.000Z');
    });
});

describe('statusUpdatesOf', () => {
    it('mantém sent, delivered, read e failed e ignora os demais', () => {
        const body: WebhookBody = bodyOf({
            statuses: [
                { id: 'w1', status: 'delivered', timestamp: '1700000000', pricing: { billable: true, category: 'utility' } },
                { id: 'w2', status: 'failed', timestamp: '1700000001', errors: [{ code: 131026 }] },
                { id: 'w3', status: 'deleted', timestamp: '1700000002' }
            ]
        });

        const updates = statusUpdatesOf(body);

        expect(updates).toHaveLength(2);
        expect(updates[0]).toMatchObject({ wamid: 'w1', status: 'delivered', pricingCategory: 'utility', billable: true });
        expect(updates[1]).toMatchObject({ status: 'failed', errorCode: '131026' });
    });
});
