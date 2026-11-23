import { describe, expect, it, vi } from 'vitest';
import { SendApplication } from '../../application/send.application';
import { WebhookApplication } from '../../application/webhook.application';
import { WebhookBodyTooLargeError, WebhookContentTypeError, WhatsAppDevRouteDisabledError } from '../../domain/whatsapp.errors';
import { WebhookController } from './webhook.controller';
import { WhatsAppDevController } from './whatsapp-dev.controller';

function request(options: { json?: boolean; raw?: Buffer; signature?: string }): never {
    return {
        is: (): string | false => (options.json === false ? false : 'application/json'),
        rawBody: options.raw,
        headers: options.signature === undefined ? {} : { 'x-hub-signature-256': options.signature }
    } as never;
}

describe('WebhookController', () => {
    it('GET devolve o desafio do application', async () => {
        const verify = vi.fn().mockResolvedValue('123');
        const controller: WebhookController = new WebhookController({ verify } as unknown as WebhookApplication);

        const type = vi.fn();

        await expect(controller.verify({ 'hub.mode': 'subscribe' }, { type } as never)).resolves.toBe('123');
        expect(type).toHaveBeenCalledWith('text/plain');
    });

    it('POST entrega o corpo cru e a assinatura sem validar nada', async () => {
        const receive = vi.fn().mockResolvedValue(undefined);
        const controller: WebhookController = new WebhookController({ receive } as unknown as WebhookApplication);

        await controller.receive(request({ raw: Buffer.from('{"a":1}'), signature: 'sha256=abc' }));
        await controller.receive(request({ raw: Buffer.from('{}') }));

        expect(receive).toHaveBeenNthCalledWith(1, '{"a":1}', 'sha256=abc');
        expect(receive).toHaveBeenNthCalledWith(2, '{}', null);
    });

    it('POST recusa o que não é JSON e o corpo acima de 3 MB', async () => {
        const controller: WebhookController = new WebhookController({ receive: vi.fn() } as unknown as WebhookApplication);

        await expect(controller.receive(request({ json: false, raw: Buffer.from('x') }))).rejects.toBeInstanceOf(WebhookContentTypeError);
        await expect(controller.receive(request({}))).rejects.toBeInstanceOf(WebhookContentTypeError);
        await expect(controller.receive(request({ raw: Buffer.alloc(3 * 1024 * 1024 + 1) }))).rejects.toBeInstanceOf(
            WebhookBodyTooLargeError
        );
    });
});

describe('WhatsAppDevController', () => {
    const enabled = { WHATSAPP_DEV_ROUTES: true } as never;

    it('lista os enviados e simula a mensagem recebida quando habilitado', async () => {
        const simulateInbound = vi.fn().mockResolvedValue(undefined);
        const devOutbox = vi.fn().mockReturnValue([{ to: '1', kind: 'text', wamid: 'w', body: 'oi' }]);
        const controller: WhatsAppDevController = new WhatsAppDevController(
            { simulateInbound } as unknown as WebhookApplication,
            { devOutbox } as unknown as SendApplication,
            enabled
        );

        expect(controller.messages().items).toHaveLength(1);
        await controller.inbound({ from: '5511999990000', text: 'oi' });
        expect(simulateInbound).toHaveBeenCalledOnce();
    });

    it('responde 404 fora do local com o mock', async () => {
        const controller: WhatsAppDevController = new WhatsAppDevController(
            {} as never,
            {} as never,
            { WHATSAPP_DEV_ROUTES: false } as never
        );

        expect(() => controller.messages()).toThrow(WhatsAppDevRouteDisabledError);
        await expect(controller.inbound({ from: '5511999990000', text: 'oi' })).rejects.toBeInstanceOf(WhatsAppDevRouteDisabledError);
    });
});
