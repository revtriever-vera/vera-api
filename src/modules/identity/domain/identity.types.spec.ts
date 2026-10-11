import { describe, expect, it } from 'vitest';
import { effectiveLocale } from './identity.types';

describe('effectiveLocale', () => {
    it('a preferência pessoal vence a da company', () => {
        expect(effectiveLocale({ locale: 'en' }, { locale: 'pt-BR' })).toBe('en');
    });

    it('sem preferência pessoal, segue a da company', () => {
        expect(effectiveLocale({ locale: null }, { locale: 'en' })).toBe('en');
        expect(effectiveLocale({ locale: null }, { locale: 'pt-BR' })).toBe('pt-BR');
    });
});
