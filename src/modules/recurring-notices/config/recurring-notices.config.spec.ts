import { describe, expect, it } from 'vitest';
import { parseRecurringNoticesConfig } from './recurring-notices.config';

describe('recurring-notices config', () => {
    it('usa o endereço local quando APP_URL vem vazio ou ausente', () => {
        expect(parseRecurringNoticesConfig({}).APP_URL).toBe('http://localhost:5173');
        expect(parseRecurringNoticesConfig({ APP_URL: '  ' }).APP_URL).toBe('http://localhost:5173');
    });

    it('tira a barra final do endereço do app', () => {
        expect(parseRecurringNoticesConfig({ APP_URL: 'https://app.example.com/' }).APP_URL).toBe('https://app.example.com');
    });
});
