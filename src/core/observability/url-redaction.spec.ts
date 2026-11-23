import { describe, expect, it } from 'vitest';
import { redactRequest, redactUrl } from './url-redaction';

describe('redação de segredo na URL', () => {
    it('esconde o token do webhook, que hoje viaja no path e cai no log', () => {
        expect(redactUrl('/webhooks/whatsapp/KDvHyMJ1UwJtW7Eggsa1xMBvzYn0ZbSB')).toBe('/webhooks/whatsapp/<oculto>');
    });

    it('esconde o token mesmo com query string junto', () => {
        expect(redactUrl('/webhooks/hubspot/segredo?tentativa=2')).toBe('/webhooks/hubspot/<oculto>?tentativa=2');
    });

    it('esconde o token do convite, que é a credencial do link', () => {
        expect(redactUrl('/invites/abc123SEGREDO')).toBe('/invites/<oculto>');
        expect(redactUrl('/invites/abc123SEGREDO?x=1')).toBe('/invites/<oculto>?x=1');
        expect(redactUrl('/notifications/unsubscribe/abc123SEGREDO.f00d')).toBe('/notifications/unsubscribe/<oculto>');
    });

    it('esconde o token da captura de cartão de dev e qualquer rota com /token/ no path', () => {
        expect(redactUrl('/billing/_dev/capture/segredo')).toBe('/billing/_dev/capture/<oculto>');
        expect(redactUrl('/qualquer/token/segredo/mais')).toBe('/qualquer/token/<oculto>/mais');
    });

    it('tira o token do convite também da linha serializada do log', () => {
        const logged: string = JSON.stringify(redactRequest({ url: '/invites/SEGREDO', params: { token: 'SEGREDO' } }));

        expect(logged).not.toContain('SEGREDO');
    });

    it('esconde code e state do callback do Google Agenda, na URL e na query', () => {
        const url: string = '/calendar/google/callback?code=4/0AbCd&state=estado.cifrado&scope=calendar';

        expect(redactUrl(url)).toBe('/calendar/google/callback?code=<oculto>&state=<oculto>&scope=calendar');
        const logged: string = JSON.stringify(
            redactRequest({ url, query: { code: '4/0AbCd', state: 'estado.cifrado', scope: 'calendar' } })
        );
        expect(logged).not.toContain('4/0AbCd');
        expect(logged).not.toContain('estado.cifrado');
        expect(logged).toContain('calendar');
    });

    it('esconde também no callback da instalação auto-hospedada', () => {
        expect(redactUrl('/google/callback?code=abc&state=xyz')).toBe('/google/callback?code=<oculto>&state=<oculto>');
    });

    it('não esconde code e state de outras rotas', () => {
        expect(redactUrl('/transactions?code=abc&state=open')).toBe('/transactions?code=abc&state=open');
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
