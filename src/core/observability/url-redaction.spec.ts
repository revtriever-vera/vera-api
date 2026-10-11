import { describe, expect, it } from 'vitest';
import { redactRequest, redactUrl } from './url-redaction';

describe('redação de segredo na URL', () => {
    it('esconde o token do webhook, que hoje viaja no path e cai no log', () => {
        expect(redactUrl('/webhooks/whatsapp/KDvHyMJ1UwJtW7Eggsa1xMBvzYn0ZbSB')).toBe('/webhooks/whatsapp/<oculto>');
    });

    it('esconde o token mesmo com query string junto', () => {
        expect(redactUrl('/webhooks/hubspot/segredo?tentativa=2')).toBe('/webhooks/hubspot/<oculto>?tentativa=2');
    });

    it('não mexe em rota sem segredo', () => {
        expect(redactUrl('/team/members/019fda2b-a34e-7798')).toBe('/team/members/019fda2b-a34e-7798');
    });

    it('não mexe no health, que é o que mais aparece no log', () => {
        expect(redactUrl('/health/ready')).toBe('/health/ready');
    });

    it('deixa o provedor visível, porque ele não é segredo e serve para depurar', () => {
        expect(redactUrl('/webhooks/mercadopago/xyz')).toContain('mercadopago');
    });

    it('esconde o verify token do WhatsApp, que chega na query string', () => {
        expect(redactUrl('/webhooks/whatsapp/abc?hub.mode=subscribe&hub.verify_token=segredo&hub.challenge=42')).toBe(
            '/webhooks/whatsapp/<oculto>?hub.mode=subscribe&hub.verify_token=<oculto>&hub.challenge=42'
        );
    });

    it('tira os params do log, porque o curinga do logger repete a URL com o token em claro', () => {
        const logged: Record<string, unknown> = {
            ...redactRequest({ url: '/webhooks/tray/segredo', query: {}, params: { path: ['webhooks', 'tray', 'segredo'] } })
        };

        expect(logged).not.toHaveProperty('params');
        expect(JSON.stringify(logged)).not.toContain('segredo');
    });

    it('mascara o verify token também no objeto query', () => {
        expect(
            redactRequest({ url: '/webhooks/whatsapp/x', query: { 'hub.verify_token': 'segredo', 'hub.mode': 'subscribe' } }).query
        ).toEqual({
            'hub.verify_token': '<oculto>',
            'hub.mode': 'subscribe'
        });
    });
});
