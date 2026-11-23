import { describe, expect, it, vi } from 'vitest';
import { WebhookEventDomain } from '../domain/webhook-event.domain';
import { WhatsAppMisconfiguredError, WebhookVerificationFailedError } from '../domain/whatsapp.errors';
import { WebhookEvent, WhatsAppChannel } from '../domain/whatsapp.types';
import { SignatureVerifier } from '../services/signature.verifier';
import { WebhookBodyService } from '../services/webhook-body.service';
import { WhatsAppChannelService } from '../services/whatsapp-channel.service';
import { WhatsAppEventProcessor } from '../services/whatsapp-event-processor.service';
import { WhatsAppLogService } from '../services/whatsapp-log.service';
import { WhatsAppMetricsService } from '../services/whatsapp-metrics.service';
import { WebhookApplication } from './webhook.application';

const SECRET: string = 'secret-for-spec-only';
const signer: SignatureVerifier = new SignatureVerifier();

function channelOf(overrides: Partial<WhatsAppChannel> = {}): WhatsAppChannel {
    return {
        phoneNumberId: 'phone-1',
        wabaId: null,
        accessToken: 'token',
        appSecret: SECRET,
        verifyToken: 'verify',
        displayNumber: null,
        companyId: 'company-1',
        ...overrides
    };
}

function rawOf(
    phone: string = 'phone-1',
    messages: unknown[] = [{ from: '1', id: 'w1', timestamp: '1700000000', type: 'text', text: { body: 'oi' } }]
): string {
    return JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: phone }, messages } }] }]
    });
}

function eventOf(rawBody: string, signature: string | null, status: string = 'received'): WebhookEvent {
    return {
        id: '0192b6c0-0000-7000-8000-000000000001',
        bodySha256: 'x',
        rawBody,
        signatureHeader: signature,
        channelKey: null,
        status,
        receivedAt: new Date(),
        processedAt: null,
        updatedAt: new Date()
    };
}

function build(options: { event?: WebhookEvent | null; hosted?: boolean; channel?: WhatsAppChannel | null }): {
    application: WebhookApplication;
    finish: ReturnType<typeof vi.fn>;
    rememberChannel: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
    store: ReturnType<typeof vi.fn>;
    processTenant: ReturnType<typeof vi.fn>;
    processHosted: ReturnType<typeof vi.fn>;
} {
    const finish: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(true);
    const rememberChannel: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const store: ReturnType<typeof vi.fn> = vi.fn();
    const publish: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const processTenant: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(true);
    const processHosted: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const channel: WhatsAppChannel | null = options.channel === undefined ? channelOf() : options.channel;
    const channels = {
        isHosted: (): boolean => options.hosted === true,
        current: vi.fn().mockResolvedValue(channel),
        byPhoneNumberId: vi.fn().mockResolvedValue(channel),
        byKey: vi.fn().mockResolvedValue(channel),
        byVerifyToken: vi.fn().mockImplementation((token: string) => Promise.resolve(token === 'verify' ? channel : null)),
        keyOf: (value: WhatsAppChannel): string => (value.companyId === null ? 'hosted' : value.phoneNumberId)
    };
    const application: WebhookApplication = new WebhookApplication(
        { find: vi.fn().mockResolvedValue(options.event ?? null), finish, rememberChannel, store } as unknown as WebhookEventDomain,
        channels as unknown as WhatsAppChannelService,
        signer,
        new WebhookBodyService(),
        { processTenant, processHosted, advance: vi.fn() } as unknown as WhatsAppEventProcessor,
        { publish, remove: vi.fn() },
        {
            signatureRejected: vi.fn(),
            channelUnknown: vi.fn(),
            bodyInvalid: vi.fn(),
            misconfigured: vi.fn(),
            webhookBatch: vi.fn()
        } as unknown as WhatsAppLogService,
        { webhook: vi.fn(), message: vi.fn() } as unknown as WhatsAppMetricsService
    );
    return { application, finish, rememberChannel, publish, store, processTenant, processHosted };
}

describe('WebhookApplication.verify', () => {
    it('ecoa o desafio com o modo e o token certos', async () => {
        await expect(
            build({}).application.verify({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify', 'hub.challenge': '123' })
        ).resolves.toBe('123');
    });

    it('recusa modo errado, token errado e parâmetro ausente', async () => {
        const { application } = build({});

        await expect(
            application.verify({ 'hub.mode': 'unsubscribe', 'hub.verify_token': 'verify', 'hub.challenge': '1' })
        ).rejects.toBeInstanceOf(WebhookVerificationFailedError);
        await expect(
            application.verify({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '1' })
        ).rejects.toBeInstanceOf(WebhookVerificationFailedError);
        await expect(application.verify({ 'hub.mode': 'subscribe' })).rejects.toBeInstanceOf(WebhookVerificationFailedError);
    });
});

describe('WebhookApplication.receive', () => {
    it('grava e publica só o id do evento', async () => {
        const { application, store, publish } = build({});
        store.mockResolvedValue({ event: eventOf('{}', null), created: true });

        await application.receive('{}', null);

        expect(publish).toHaveBeenCalledWith(
            'vera-whatsapp',
            'whatsapp.webhook.received',
            { eventId: '0192b6c0-0000-7000-8000-000000000001' },
            { jobId: 'wa-webhook-0192b6c0-0000-7000-8000-000000000001' }
        );
    });

    it('não publica de novo quando o evento já foi tratado e republica o que ficou recebido', async () => {
        const { application, store, publish } = build({});
        store.mockResolvedValueOnce({ event: eventOf('{}', null, 'processed'), created: false });
        store.mockResolvedValueOnce({ event: eventOf('{}', null, 'received'), created: false });

        await application.receive('{}', null);
        expect(publish).not.toHaveBeenCalled();
        await application.receive('{}', null);
        expect(publish).toHaveBeenCalledOnce();
    });
});

describe('WebhookApplication.processEvent', () => {
    it('com assinatura válida publica um job por item e marca processado', async () => {
        const raw: string = rawOf();
        const { application, finish, publish } = build({ event: eventOf(raw, signer.sign(raw, SECRET)) });

        await application.processEvent('0192b6c0-0000-7000-8000-000000000001');

        expect(publish).toHaveBeenCalledWith('vera-whatsapp', 'whatsapp.inbound.received', expect.objectContaining({ wamid: 'w1' }), {
            jobId: 'wa-inbound-w1'
        });
        expect(finish).toHaveBeenCalledWith('0192b6c0-0000-7000-8000-000000000001', 'processed', 'phone-1');
    });

    it('grava o canal no evento antes de publicar, porque o job de mensagem lê o canal dele', async () => {
        const raw: string = rawOf();
        const { application, rememberChannel, publish } = build({ event: eventOf(raw, signer.sign(raw, SECRET)) });

        await application.processEvent('0192b6c0-0000-7000-8000-000000000001');

        expect(rememberChannel).toHaveBeenCalledWith('0192b6c0-0000-7000-8000-000000000001', 'phone-1');
        expect(rememberChannel.mock.invocationCallOrder[0]).toBeLessThan(publish.mock.invocationCallOrder[0] ?? 0);
    });

    it('rejeitado: assinatura errada encerra o evento sem retry e sem publicar', async () => {
        const raw: string = rawOf();
        const { application, finish, publish } = build({ event: eventOf(raw, signer.sign(raw, 'other')) });

        await expect(application.processEvent('0192b6c0-0000-7000-8000-000000000001')).resolves.toBeUndefined();

        expect(finish).toHaveBeenCalledWith('0192b6c0-0000-7000-8000-000000000001', 'rejected', 'phone-1');
        expect(publish).not.toHaveBeenCalled();
    });

    it('rejeitado: canal desconhecido e corpo com mais de um número', async () => {
        const raw: string = rawOf();
        const unknown = build({ event: eventOf(raw, null), channel: null });
        const two: string = JSON.stringify({
            object: 'x',
            entry: [
                { changes: [{ value: { metadata: { phone_number_id: 'a' } } }] },
                { changes: [{ value: { metadata: { phone_number_id: 'b' } } }] }
            ]
        });
        const mixed = build({ event: eventOf(two, null) });

        await unknown.application.processEvent('e');
        await mixed.application.processEvent('e');

        expect(unknown.finish).toHaveBeenCalledWith(expect.any(String), 'rejected', null);
        expect(mixed.finish).toHaveBeenCalledWith(expect.any(String), 'rejected', null);
    });

    it('mal configurado: sem canal na hospedada ou sem app secret lança, para a fila tentar de novo', async () => {
        const raw: string = rawOf();
        const noChannel = build({ event: eventOf(raw, null), hosted: true, channel: null });
        const noSecret = build({ event: eventOf(raw, null), hosted: true, channel: channelOf({ appSecret: '', companyId: null }) });

        await expect(noChannel.application.processEvent('e')).rejects.toBeInstanceOf(WhatsAppMisconfiguredError);
        await expect(noSecret.application.processEvent('e')).rejects.toBeInstanceOf(WhatsAppMisconfiguredError);
        expect(noChannel.finish).not.toHaveBeenCalled();
        expect(noSecret.finish).not.toHaveBeenCalled();
    });

    it('corpo inválido depois de assinado vira invalid; número diferente do canal também', async () => {
        const bad: string = '{"object":1}';
        const invalid = build({ event: eventOf(bad, signer.sign(bad, SECRET)), hosted: true, channel: channelOf({ companyId: null }) });
        const other: string = rawOf('phone-2');
        const wrongPhone = build({
            event: eventOf(other, signer.sign(other, SECRET)),
            hosted: true,
            channel: channelOf({ companyId: null })
        });

        await invalid.application.processEvent('e');
        await wrongPhone.application.processEvent('e');

        expect(invalid.finish).toHaveBeenCalledWith(expect.any(String), 'invalid', 'hosted');
        expect(wrongPhone.finish).toHaveBeenCalledWith(expect.any(String), 'invalid', 'hosted');
    });

    it('ignora o evento que já saiu de received ou que não existe', async () => {
        const done = build({ event: eventOf(rawOf(), null, 'processed') });
        const missing = build({ event: null });

        await done.application.processEvent('e');
        await missing.application.processEvent('e');

        expect(done.finish).not.toHaveBeenCalled();
        expect(missing.finish).not.toHaveBeenCalled();
    });
});

describe('WebhookApplication.processInbound', () => {
    const raw: string = rawOf();

    it('entrega a mensagem ao processador da company, ou ao hospedado sem company', async () => {
        const tenant = build({ event: { ...eventOf(raw, null), channelKey: 'phone-1' } });
        const hosted = build({ event: { ...eventOf(raw, null), channelKey: 'hosted' }, channel: channelOf({ companyId: null }) });

        await tenant.application.processInbound('e', 'w1');
        await hosted.application.processInbound('e', 'w1');

        expect(tenant.processTenant).toHaveBeenCalledWith('company-1', expect.objectContaining({ wamid: 'w1' }), expect.anything());
        expect(hosted.processHosted).toHaveBeenCalledOnce();
    });

    it('não faz nada quando o evento já foi apagado ou a mensagem não está nele; sem canal lança', async () => {
        const gone = build({ event: null });
        const absent = build({ event: { ...eventOf(raw, null), channelKey: 'phone-1' } });
        const noChannel = build({ event: { ...eventOf(raw, null), channelKey: 'phone-1' }, channel: null });

        await gone.application.processInbound('e', 'w1');
        await absent.application.processInbound('e', 'other');

        expect(gone.processTenant).not.toHaveBeenCalled();
        expect(absent.processTenant).not.toHaveBeenCalled();
        await expect(noChannel.application.processInbound('e', 'w1')).rejects.toBeInstanceOf(WhatsAppMisconfiguredError);
    });
});
