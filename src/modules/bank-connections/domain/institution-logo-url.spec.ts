import { describe, expect, it } from 'vitest';
import { INSTITUTION_LOGO_URL_MAX_LENGTH, sanitizeLogoUrl } from './institution-logo-url';

describe('sanitizeLogoUrl', (): void => {
    it('accepts https urls', (): void => {
        expect(sanitizeLogoUrl('https://logos.example/nubank.png')).toBe('https://logos.example/nubank.png');
    });

    it('trims surrounding whitespace', (): void => {
        expect(sanitizeLogoUrl('  https://logos.example/a.svg ')).toBe('https://logos.example/a.svg');
    });

    it.each([
        ['javascript scheme', 'javascript:alert(1)'],
        ['data scheme', 'data:image/png;base64,AAAA'],
        ['http scheme', 'http://logos.example/a.png'],
        ['protocol relative', '//logos.example/a.png'],
        ['credentials', 'https://user:pass@logos.example/a.png'],
        ['not a url', 'not a url'],
        ['empty', '   ']
    ])('rejects %s', (_label: string, value: string): void => {
        expect(sanitizeLogoUrl(value)).toBeNull();
    });

    it('rejects null and undefined', (): void => {
        expect(sanitizeLogoUrl(null)).toBeNull();
        expect(sanitizeLogoUrl(undefined)).toBeNull();
    });

    it('rejects urls longer than the limit', (): void => {
        const padding: string = 'a'.repeat(INSTITUTION_LOGO_URL_MAX_LENGTH);
        expect(sanitizeLogoUrl(`https://logos.example/${padding}.png`)).toBeNull();
    });
});
