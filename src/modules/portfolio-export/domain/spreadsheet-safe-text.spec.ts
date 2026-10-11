import { describe, expect, it } from 'vitest';
import { spreadsheetSafeText } from './spreadsheet-safe-text';

describe('spreadsheetSafeText', () => {
    it.each(['=HYPERLINK("http://x")', '+1', '-2 CDB', '@cmd', '\tcmd', '\rcmd'])('prefixes an apostrophe on %j', (text: string) => {
        expect(spreadsheetSafeText(text)).toBe(`'${text}`);
    });

    it('keeps ordinary text, accents and empty text untouched', () => {
        expect(spreadsheetSafeText('CDB Banco XP')).toBe('CDB Banco XP');
        expect(spreadsheetSafeText('Itaú')).toBe('Itaú');
        expect(spreadsheetSafeText('')).toBe('');
    });

    it('only looks at the start of the text', () => {
        expect(spreadsheetSafeText('CDB = 110% do CDI')).toBe('CDB = 110% do CDI');
    });
});
