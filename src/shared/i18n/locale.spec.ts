import { describe, expect, it } from 'vitest';
import { AppLocale, DEFAULT_LOCALE, closestAppLocale, resolveLocale } from './locale';

describe('resolveLocale', () => {
    it('falls back to pt-BR when the header is missing', () => {
        expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE);
        expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
        expect(resolveLocale('')).toBe(DEFAULT_LOCALE);
    });

    it('maps a region variant to its base locale', () => {
        expect(resolveLocale('en-US')).toBe('en');
        expect(resolveLocale('pt-PT')).toBe('pt-BR');
        expect(resolveLocale('pt')).toBe('pt-BR');
    });

    it('respects the q weight, preferring the highest quality tag', () => {
        expect(resolveLocale('pt-BR;q=0.5,en;q=0.9')).toBe('en');
    });

    it('skips unsupported tags and picks the next supported one', () => {
        expect(resolveLocale('de-DE,fr;q=0.9,pt-BR;q=0.5')).toBe('pt-BR');
    });

    it('falls back to pt-BR when no tag is supported', () => {
        const result: AppLocale = resolveLocale('de-DE,fr-FR');
        expect(result).toBe(DEFAULT_LOCALE);
    });

    it('does not support spanish', () => {
        expect(resolveLocale('es-AR')).toBe(DEFAULT_LOCALE);
    });

    it('ignores the wildcard tag', () => {
        expect(resolveLocale('*')).toBe(DEFAULT_LOCALE);
    });
});

describe('closestAppLocale', () => {
    it('maps a store locale to the closest supported one, falling back to en', () => {
        expect(closestAppLocale('pt-PT')).toBe('pt-BR');
        expect(closestAppLocale('pt_BR')).toBe('pt-BR');
        expect(closestAppLocale('es-MX')).toBe('en');
        expect(closestAppLocale('en-US')).toBe('en');
        expect(closestAppLocale('fr-FR')).toBe('en');
    });
});
