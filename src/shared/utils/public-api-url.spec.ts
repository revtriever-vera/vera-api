import { describe, expect, it } from 'vitest';
import { parseGoogleCalendarConfig } from '../../modules/google-calendar/config/google-calendar.config';
import { publicApiUrl } from './public-api-url';

describe('publicApiUrl', () => {
    it('junta base e caminho sem prefixo e sem barra duplicada', () => {
        expect(publicApiUrl('https://api.vera.example/', '/whatsapp/webhook')).toBe('https://api.vera.example/whatsapp/webhook');
        expect(publicApiUrl('https://api.vera.example', 'notifications/unsubscribe/tok')).toBe(
            'https://api.vera.example/notifications/unsubscribe/tok'
        );
    });

    it('callback do Google hospedado e self-hosted ficam sem /api', () => {
        const settings = parseGoogleCalendarConfig({ PUBLIC_API_URL: 'https://api.vera.example' } as NodeJS.ProcessEnv);
        expect(settings.hostedRedirectUri).toBe('https://api.vera.example/calendar/google/callback');
        expect(settings.selfHostedRedirectUri).toBe('https://api.vera.example/google/callback');
    });
});
