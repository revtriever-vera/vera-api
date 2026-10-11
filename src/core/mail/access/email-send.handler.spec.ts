import { describe, expect, it, vi } from 'vitest';
import { QueueEnvelope } from '../../queue/queue.types';
import { BLOCKED_PROVIDER } from '../allowlist-mail.port';
import { MailLogService } from '../mail-log.service';
import { EnqueueMailRequest } from '../mailer.port';
import { MailPort } from '../mail.port';
import { MailContent, MailReceipt } from '../mail.types';
import { TemplateRegistry } from '../template.registry';
import { EmailSendHandler } from './email-send.handler';

function envelopeOf(payload: EnqueueMailRequest): QueueEnvelope<EnqueueMailRequest> {
    return { type: 'email.send.requested', requestId: 'req-1', companyId: null, occurredAt: new Date().toISOString(), trace: {}, payload };
}

function registryWith(content: MailContent): TemplateRegistry {
    const registry: TemplateRegistry = new TemplateRegistry();
    registry.register('identity.email-otp', 'pt-BR', () => content);
    return registry;
}

function requestOf(): EnqueueMailRequest {
    return { template: 'identity.email-otp', locale: 'pt-BR', props: {}, to: { email: 'ana@cliente.com' } };
}

function logsOf(): { logs: MailLogService; emailAccepted: ReturnType<typeof vi.fn>; emailGaveUp: ReturnType<typeof vi.fn> } {
    const emailAccepted: ReturnType<typeof vi.fn> = vi.fn();
    const emailGaveUp: ReturnType<typeof vi.fn> = vi.fn();
    return { logs: { emailAccepted, emailGaveUp } as unknown as MailLogService, emailAccepted, emailGaveUp };
}

describe('EmailSendHandler', () => {
    it('renders the template in the requested locale and sends through MailPort', async () => {
        const content: MailContent = { subject: 'assunto', html: '<p>html</p>', text: 'texto' };
        const send: ReturnType<typeof vi.fn> = vi
            .fn()
            .mockResolvedValue({ provider: 'smtp', providerMessageId: 'id-1', acceptedAt: new Date() } satisfies MailReceipt);
        const mail: MailPort = { send };
        const { logs, emailAccepted } = logsOf();
        const handler: EmailSendHandler = new EmailSendHandler(registryWith(content), mail, logs);

        await handler.handle(envelopeOf(requestOf()));

        expect(send).toHaveBeenCalledWith(expect.objectContaining({ subject: 'assunto', to: { email: 'ana@cliente.com' } }));
        expect(emailAccepted).toHaveBeenCalledWith('identity.email-otp', 'smtp');
    });

    it('does not log acceptance when the allowlist blocked the recipient', async () => {
        const content: MailContent = { subject: 'assunto', html: '<p>html</p>', text: 'texto' };
        const send: ReturnType<typeof vi.fn> = vi
            .fn()
            .mockResolvedValue({ provider: BLOCKED_PROVIDER, providerMessageId: null, acceptedAt: new Date() } satisfies MailReceipt);
        const mail: MailPort = { send };
        const { logs, emailAccepted } = logsOf();
        const handler: EmailSendHandler = new EmailSendHandler(registryWith(content), mail, logs);

        await handler.handle(envelopeOf(requestOf()));

        expect(emailAccepted).not.toHaveBeenCalled();
    });

    it('logs gave-up on job failure', async () => {
        const { logs, emailGaveUp } = logsOf();
        const mail: MailPort = { send: vi.fn() };
        const handler: EmailSendHandler = new EmailSendHandler(new TemplateRegistry(), mail, logs);

        await handler.handleJobFailure(envelopeOf(requestOf()), new Error('boom'));

        expect(emailGaveUp).toHaveBeenCalledWith('identity.email-otp', expect.any(Error));
    });
});
