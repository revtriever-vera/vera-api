import { describe, expect, it, vi } from 'vitest';
import { ChannelHealthDomain } from '../domain/channel-health.domain';
import { WhatsAppMessageDomain } from '../domain/whatsapp-message.domain';
import { WhatsAppMessage, WhatsAppChannel } from '../domain/whatsapp.types';
import { WhatsAppCloudPort, WhatsAppGraphError } from '../ports/whatsapp-cloud.port';
import { MockOutbox } from '../services/mock-outbox.service';
import { OutboundFailureRegistry } from '../services/outbound-failure.registry';
import { WhatsAppChannelService } from '../services/whatsapp-channel.service';
import { WhatsAppMetricsService } from '../services/whatsapp-metrics.service';
import { WhatsAppWindowService } from '../services/whatsapp-window.service';
import { SendApplication } from './send.application';

const CHANNEL: WhatsAppChannel = {
    phoneNumberId: 'phone-1',
    wabaId: null,
    accessToken: 't',
    appSecret: 's',
    verifyToken: 'v',
    displayNumber: null,
    companyId: 'c1'
};

function messageOf(overrides: Partial<WhatsAppMessage> = {}): WhatsAppMessage {
    return {
        id: 'm1',
        companyId: 'c1',
        linkId: null,
        peer: '5511999990000',
        direction: 'out',
        kind: 'text',
        templateName: null,
        payload: null,
        externalId: null,
        status: 'queued',
        body: 'olá',
        errorCode: null,
        pricingCategory: null,
        billable: null,
        sentAt: null,
        deliveredAt: null,
        readAt: null,
        failedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides
    };
}

function build(options: {
    message?: WhatsAppMessage | null;
    channel?: WhatsAppChannel | null;
    allowed?: string[];
    windowOpen?: boolean;
    claimed?: boolean;
    port?: Partial<WhatsAppCloudPort>;
}) {
    const messages = {
        find: vi.fn().mockResolvedValue(options.message === undefined ? messageOf() : options.message),
        claimSending: vi.fn().mockResolvedValue(options.claimed ?? true),
        releaseSending: vi.fn().mockResolvedValue(undefined),
        markSent: vi.fn().mockResolvedValue(undefined),
        markEnded: vi.fn().mockResolvedValue(undefined)
    };
    const health = { markTokenInvalid: vi.fn().mockResolvedValue(undefined) };
    const port = {
        sendText: vi.fn().mockResolvedValue({ wamid: 'wamid.1' }),
        sendTemplate: vi.fn().mockResolvedValue({ wamid: 'wamid.2' }),
        sendInteractive: vi.fn().mockResolvedValue({ wamid: 'wamid.3' }),
        ...options.port
    };
    const application: SendApplication = new SendApplication(
        messages as unknown as WhatsAppMessageDomain,
        health as unknown as ChannelHealthDomain,
        {
            current: vi.fn().mockResolvedValue(options.channel === undefined ? CHANNEL : options.channel),
            keyOf: () => 'phone-1'
        } as unknown as WhatsAppChannelService,
        { isOpen: vi.fn().mockResolvedValue(options.windowOpen ?? true) } as unknown as WhatsAppWindowService,
        port as unknown as WhatsAppCloudPort,
        new MockOutbox(),
        { message: vi.fn() } as unknown as WhatsAppMetricsService,
        { notify: vi.fn().mockResolvedValue(undefined) } as unknown as OutboundFailureRegistry,
        { WHATSAPP_ALLOWED_RECIPIENTS: options.allowed ?? ['*'] } as never
    );
    return { application, messages, health, port };
}

describe('SendApplication.process', () => {
    it('envia o texto, grava o wamid e marca enviado', async () => {
        const { application, messages, port } = build({});

        await application.process('m1', false);

        expect(port.sendText).toHaveBeenCalledWith(CHANNEL, '5511999990000', 'olá');
        expect(messages.markSent).toHaveBeenCalledWith('m1', 'wamid.1');
    });

    it('envia template e interativo pelo que está no payload', async () => {
        const template = build({
            message: messageOf({
                kind: 'template',
                templateName: 'vera_lembrete',
                body: null,
                payload: { template: { language: 'pt_BR', variables: ['pagar'] } } as never
            })
        });
        const interactive = build({
            message: messageOf({ kind: 'interactive', payload: { choices: [{ id: 'rem:done:1', title: 'Feito' }] } as never })
        });

        await template.application.process('m1', false);
        await interactive.application.process('m1', false);

        expect(template.port.sendTemplate).toHaveBeenCalledWith(CHANNEL, '5511999990000', {
            name: 'vera_lembrete',
            language: 'pt_BR',
            variables: ['pagar']
        });
        expect(interactive.port.sendInteractive).toHaveBeenCalledWith(CHANNEL, '5511999990000', {
            body: 'olá',
            choices: [{ id: 'rem:done:1', title: 'Feito' }]
        });
    });

    it('fora da allowlist marca blocked sem enviar', async () => {
        const { application, messages, port } = build({ allowed: ['5511000000000'] });

        await application.process('m1', false);

        expect(messages.markEnded).toHaveBeenCalledWith('m1', 'blocked', 'recipient_not_allowed');
        expect(port.sendText).not.toHaveBeenCalled();
    });

    it('texto com a janela fechada falha como window_closed; template não precisa da janela', async () => {
        const text = build({ windowOpen: false });
        const template = build({
            windowOpen: false,
            message: messageOf({
                kind: 'template',
                templateName: 'vera_lembrete',
                payload: { template: { language: 'en', variables: [] } } as never
            })
        });

        await text.application.process('m1', false);
        await template.application.process('m1', false);

        expect(text.messages.markEnded).toHaveBeenCalledWith('m1', 'failed', 'window_closed');
        expect(template.messages.markSent).toHaveBeenCalled();
    });

    it('sem canal falha como provider_disabled', async () => {
        const { application, messages } = build({ channel: null });

        await application.process('m1', false);

        expect(messages.markEnded).toHaveBeenCalledWith('m1', 'failed', 'provider_disabled');
    });

    it('ignora mensagem que não está mais na fila ou que outro worker reivindicou', async () => {
        const sent = build({ message: messageOf({ status: 'sent' }) });
        const missing = build({ message: null });
        const lost = build({ claimed: false });

        await sent.application.process('m1', false);
        await missing.application.process('m1', false);
        await lost.application.process('m1', false);

        expect(sent.port.sendText).not.toHaveBeenCalled();
        expect(missing.port.sendText).not.toHaveBeenCalled();
        expect(lost.port.sendText).not.toHaveBeenCalled();
    });

    it('limite de taxa e 5xx devolvem a mensagem à fila e relançam, e na última tentativa falham', async () => {
        const failing = { sendText: vi.fn().mockRejectedValue(new WhatsAppGraphError('rate_limited', '130429', 429)) };
        const { application, messages } = build({ port: failing });

        await expect(application.process('m1', false)).rejects.toBeInstanceOf(WhatsAppGraphError);
        expect(messages.releaseSending).toHaveBeenCalledWith('m1');

        await application.process('m1', true);
        expect(messages.markEnded).toHaveBeenCalledWith('m1', 'failed', '130429');
    });

    it('erro de janela e de destinatário falham sem repetir; erro inesperado repete', async () => {
        const window = build({ port: { sendText: vi.fn().mockRejectedValue(new WhatsAppGraphError('window_closed', '131047', 400)) } });
        const unexpected = build({ port: { sendText: vi.fn().mockRejectedValue(new Error('boom')) } });

        await window.application.process('m1', false);
        await expect(unexpected.application.process('m1', false)).rejects.toThrow('boom');

        expect(window.messages.markEnded).toHaveBeenCalledWith('m1', 'failed', '131047');
        expect(unexpected.messages.releaseSending).toHaveBeenCalled();
    });

    it('token recusado marca o canal inválido e falha sem repetir', async () => {
        const { application, health, messages } = build({
            port: { sendText: vi.fn().mockRejectedValue(new WhatsAppGraphError('token_invalid', '190', 401)) }
        });

        await application.process('m1', false);

        expect(health.markTokenInvalid).toHaveBeenCalledWith('phone-1');
        expect(messages.markEnded).toHaveBeenCalledWith('m1', 'failed', '190');
    });
});
