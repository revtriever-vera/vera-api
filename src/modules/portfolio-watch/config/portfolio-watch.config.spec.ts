import { describe, expect, it } from 'vitest';
import { parsePortfolioWatchConfig } from './portfolio-watch.config';

describe('parsePortfolioWatchConfig', () => {
    it('usa o endereço local quando APP_URL falta ou está em branco', () => {
        expect(parsePortfolioWatchConfig({}).APP_URL).toBe('http://localhost:5173');
        expect(parsePortfolioWatchConfig({ APP_URL: '  ' }).APP_URL).toBe('http://localhost:5173');
    });

    it('tira a barra final do endereço', () => {
        expect(parsePortfolioWatchConfig({ APP_URL: 'https://app.example.com/' }).APP_URL).toBe('https://app.example.com');
    });
});
