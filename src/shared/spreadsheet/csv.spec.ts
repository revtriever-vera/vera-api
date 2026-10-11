import { describe, expect, it } from 'vitest';
import { csvLine, decimalValueOf, localizedNumber, writeCsv } from './csv';

describe('decimalValueOf', () => {
    it('applies the exponent of the currency', () => {
        expect(decimalValueOf(7_560_000, 'BRL')).toBe('75600.00');
        expect(decimalValueOf(5, 'USD')).toBe('0.05');
        expect(decimalValueOf(500, 'JPY')).toBe('500');
        expect(decimalValueOf(-35_000, 'BRL')).toBe('-350.00');
    });
});

describe('localizedNumber', () => {
    it('uses the decimal mark of the locale', () => {
        expect(localizedNumber('-350.00', 'pt-BR')).toBe('-350,00');
        expect(localizedNumber('-350.00', 'en')).toBe('-350.00');
    });
});

describe('csvLine', () => {
    it('joins with the delimiter of the locale and ends with CRLF', () => {
        expect(csvLine(['a', 'b'], 'pt-BR')).toBe('a;b\r\n');
        expect(csvLine(['a', 'b'], 'en')).toBe('a,b\r\n');
    });

    it('quotes the delimiter, quotes and line breaks', () => {
        expect(csvLine(['a;b', 'say "hi"', 'x\ny', 'r\rr'], 'pt-BR')).toBe('"a;b";"say ""hi""";"x\ny";"r\rr"\r\n');
        expect(csvLine(['a;b', 'c,d'], 'en')).toBe('a;b,"c,d"\r\n');
    });
});

describe('writeCsv', () => {
    it('starts with the BOM and writes header and rows', () => {
        expect(writeCsv(['A', 'B'], [['1', '2']], 'en')).toBe('﻿A,B\r\n1,2\r\n');
    });

    it('writes only the header without rows', () => {
        expect(writeCsv(['A'], [], 'pt-BR')).toBe('﻿A\r\n');
    });
});
