import { describe, expect, it, vi } from 'vitest';
import { QueuePublisherPort } from '../queue/queue.types';
import { EnqueueMailRequest, QueueMailer } from './mailer.port';

function requestOf(overrides: Partial<EnqueueMailRequest> = {}): EnqueueMailRequest {
    return {
        template: 'identity.email-otp',
        locale: 'pt-BR',
        props: { code: '123456' },
        to: { email: 'ana@cliente.com' },
        ...overrides
    };
}

describe('QueueMailer', () => {
    it('publishes to the email-send queue with the fixed message type', async () => {
        const publish: ReturnType<typeof vi.fn> = vi.fn();
        const publisher: QueuePublisherPort = { publish };
        const mailer: QueueMailer = new QueueMailer(publisher);

        await mailer.enqueue(requestOf());

        expect(publish).toHaveBeenCalledWith('vera-email-send', 'email.send.requested', requestOf(), { jobId: undefined });
    });

    it('builds a deterministic jobId from the template and the reference', async () => {
        const publish: ReturnType<typeof vi.fn> = vi.fn();
        const publisher: QueuePublisherPort = { publish };
        const mailer: QueueMailer = new QueueMailer(publisher);

        await mailer.enqueue(requestOf({ reference: 'otp-user-1' }));

        expect(publish).toHaveBeenCalledWith('vera-email-send', 'email.send.requested', requestOf({ reference: 'otp-user-1' }), {
            jobId: 'email-identity.email-otp-otp-user-1'
        });
    });
});
