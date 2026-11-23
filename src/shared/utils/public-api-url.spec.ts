import { describe, expect, it } from 'vitest';
import { publicApiUrl } from './public-api-url';

describe('publicApiUrl', () => {
    it('junta base e caminho sem prefixo e sem barra duplicada', () => {
        expect(publicApiUrl('https://api.vera.example/', '/whatsapp/webhook')).toBe('https://api.vera.example/whatsapp/webhook');
        expect(publicApiUrl('https://api.vera.example', 'notifications/unsubscribe/tok')).toBe(
            'https://api.vera.example/notifications/unsubscribe/tok'
        );
    });
});
