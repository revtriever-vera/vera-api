import { describe, expect, it } from 'vitest';
import { parseGoogleCalendarConfig } from './google-calendar.config';

describe('parseGoogleCalendarConfig', () => {
    it('usa mock e os redirects derivados da URL pública por padrão', () => {
        const config = parseGoogleCalendarConfig({ PUBLIC_API_URL: 'https://vera.example.com/' });

        expect(config.GOOGLE_CALENDAR_DRIVER).toBe('mock');
        expect(config.hostedRedirectUri).toBe('https://vera.example.com/api/calendar/google/callback');
        expect(config.selfHostedRedirectUri).toBe('https://vera.example.com/api/google/callback');
    });

    it('aceita o redirect da hospedada configurado e trata vazio como ausente', () => {
        const config = parseGoogleCalendarConfig({
            GOOGLE_CALENDAR_REDIRECT_URI: 'https://api.vera.example/calendar/google/callback',
            GOOGLE_CLIENT_SECRET: '',
            GOOGLE_CALENDAR_DRIVER: 'google'
        });

        expect(config.hostedRedirectUri).toBe('https://api.vera.example/calendar/google/callback');
        expect(config.GOOGLE_CLIENT_SECRET).toBeUndefined();
        expect(config.GOOGLE_CALENDAR_DRIVER).toBe('google');
    });
});
