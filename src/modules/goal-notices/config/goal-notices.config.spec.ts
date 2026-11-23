import { describe, expect, it } from 'vitest';
import { parseGoalNoticesConfig } from './goal-notices.config';

describe('parseGoalNoticesConfig', () => {
    it('usa o endereço local quando APP_URL falta ou está em branco', () => {
        expect(parseGoalNoticesConfig({}).APP_URL).toBe('http://localhost:5173');
        expect(parseGoalNoticesConfig({ APP_URL: '  ' }).APP_URL).toBe('http://localhost:5173');
    });

    it('tira a barra final do endereço', () => {
        expect(parseGoalNoticesConfig({ APP_URL: 'https://app.example.com/' }).APP_URL).toBe('https://app.example.com');
    });
});
