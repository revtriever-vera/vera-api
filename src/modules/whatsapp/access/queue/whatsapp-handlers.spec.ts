import { describe, expect, it, vi } from 'vitest';
import { QueueEnvelope } from '../../../../core/queue/queue.types';
import { SendApplication } from '../../application/send.application';
import { WebhookApplication } from '../../application/webhook.application';
import { InboundMessageHandler } from './inbound.handler';
import { MessageSendHandler } from './send.handler';
import { MessageStatusHandler } from './status.handler';
import { WebhookReceivedHandler } from './webhook.handler';

const ID: string = '0192b6c0-0000-7000-8000-000000000001';

function envelope(type: string, payload: unknown): QueueEnvelope {
    return { type, requestId: 'r', companyId: null, occurredAt: new Date().toISOString(), trace: {}, payload };
}

describe('handlers da fila vera-whatsapp', () => {
    it('declaram a fila e o tipo de cada job', () => {
        const application = {} as never;

        expect(
            [
                new WebhookReceivedHandler(application),
                new InboundMessageHandler(application),
                new MessageStatusHandler(application),
                new MessageSendHandler(application)
            ].map((handler) => [handler.queue, handler.type])
        ).toEqual([
            ['vera-whatsapp', 'whatsapp.webhook.received'],
            ['vera-whatsapp', 'whatsapp.inbound.received'],
            ['vera-whatsapp', 'whatsapp.status.received'],
            ['vera-whatsapp', 'whatsapp.send.requested']
        ]);
    });

    it('entregam o payload válido à application', async () => {
        const processEvent = vi.fn().mockResolvedValue(undefined);
        const processInbound = vi.fn().mockResolvedValue(undefined);
        const processStatus = vi.fn().mockResolvedValue(undefined);
        const process = vi.fn().mockResolvedValue(undefined);
        const webhook = { processEvent, processInbound, processStatus } as unknown as WebhookApplication;

        await new WebhookReceivedHandler(webhook).handle(envelope('x', { eventId: ID }));
        await new InboundMessageHandler(webhook).handle(envelope('x', { eventId: ID, wamid: 'w' }));
        await new MessageStatusHandler(webhook).handle(envelope('x', { eventId: ID, wamid: 'w', status: 'read' }));
        await new MessageSendHandler({ process } as unknown as SendApplication).handle(envelope('x', { messageId: ID }));

        expect(processEvent).toHaveBeenCalledWith(ID);
        expect(processInbound).toHaveBeenCalledWith(ID, 'w');
        expect(processStatus).toHaveBeenCalledWith(ID, 'w', 'read');
        expect(process).toHaveBeenCalledWith(ID, true);
    });

    it('o envio sabe se é a última tentativa pelo job', async () => {
        const process = vi.fn().mockResolvedValue(undefined);
        const handler: MessageSendHandler = new MessageSendHandler({ process } as unknown as SendApplication);
        const running = (
            attemptsStarted: number
        ): { id: string; attemptsStarted: number; maxAttempts: number; moveToDelayed: () => Promise<void> } => ({
            id: 'j',
            attemptsStarted,
            maxAttempts: 3,
            moveToDelayed: vi.fn()
        });

        await handler.handle(envelope('x', { messageId: ID }), running(2));
        await handler.handle(envelope('x', { messageId: ID }), running(3));

        expect(process.mock.calls.map((call: unknown[]) => call[1])).toEqual([false, true]);
    });

    it('descartam o payload inválido sem lançar, para não repetir um job impossível', async () => {
        const processEvent = vi.fn();
        const process = vi.fn();

        await new WebhookReceivedHandler({ processEvent } as unknown as WebhookApplication).handle(envelope('x', { eventId: 'nope' }));
        await new MessageSendHandler({ process } as unknown as SendApplication).handle(envelope('x', null));

        expect(processEvent).not.toHaveBeenCalled();
        expect(process).not.toHaveBeenCalled();
    });
});
