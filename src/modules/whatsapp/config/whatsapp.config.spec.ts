import { describe, expect, it } from 'vitest';
import { digitsOf, parseWhatsAppConfig } from './whatsapp.config';

describe('parseWhatsAppConfig', () => {
    it('usa mock no local e cloud fora dele, com os padrões', () => {
        const local = parseWhatsAppConfig({ IS_LOCAL: 'true' });
        const remote = parseWhatsAppConfig({});

        expect(local).toMatchObject({ WHATSAPP_DRIVER: 'mock', WHATSAPP_DEV_ROUTES: true, WHATSAPP_ALLOWED_RECIPIENTS: ['*'] });
        expect(remote).toMatchObject({ WHATSAPP_DRIVER: 'cloud', WHATSAPP_DEV_ROUTES: false, WHATSAPP_TEXT_RETENTION_DAYS: 30 });
        expect(remote.WHATSAPP_GRAPH_BASE_URL).toBe('https://graph.facebook.com');
        expect(remote.WHATSAPP_TEMPLATES_AUTO_SUBMIT).toBe(true);
    });

    it('as rotas de dev só existem no local com o mock', () => {
        expect(parseWhatsAppConfig({ IS_LOCAL: 'true', WHATSAPP_DRIVER: 'cloud' }).WHATSAPP_DEV_ROUTES).toBe(false);
        expect(parseWhatsAppConfig({ WHATSAPP_DRIVER: 'mock' }).WHATSAPP_DEV_ROUTES).toBe(false);
    });

    it('normaliza a lista de destinatários em dígitos e a URL sem barra final', () => {
        const config = parseWhatsAppConfig({
            WHATSAPP_ALLOWED_RECIPIENTS: '+55 11 99999-0000, 5511888880000, ',
            WHATSAPP_GRAPH_BASE_URL: 'https://graph.example.com/',
            WHATSAPP_TEMPLATES_AUTO_SUBMIT: 'false',
            WHATSAPP_DISPLAY_NUMBER: '+55 11 0000-0000'
        });

        expect(config.WHATSAPP_ALLOWED_RECIPIENTS).toEqual(['5511999990000', '5511888880000']);
        expect(config.WHATSAPP_GRAPH_BASE_URL).toBe('https://graph.example.com');
        expect(config.WHATSAPP_TEMPLATES_AUTO_SUBMIT).toBe(false);
        expect(config.WHATSAPP_DISPLAY_NUMBER).toBe('+55 11 0000-0000');
    });

    it('recusa a versão da Graph fora do formato e o prazo de retenção absurdo', () => {
        expect(() => parseWhatsAppConfig({ WHATSAPP_GRAPH_VERSION: '21' })).toThrow();
        expect(() => parseWhatsAppConfig({ WHATSAPP_TEXT_RETENTION_DAYS: '9999' })).toThrow();
    });

    it('digitsOf tira tudo que não é dígito', () => {
        expect(digitsOf('+55 (11) 9')).toBe('5511' + '9');
    });
});
