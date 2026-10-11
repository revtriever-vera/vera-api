import { describe, expect, it } from 'vitest';
import { clip, joinDescription, lastDigits, parseAmountMinor, parseDateWith, parseOfxDate } from './statement-values';

describe('parseAmountMinor', () => {
    it.each([
        ['-35.90', 'auto', -3_590],
        ['35,90', 'auto', 3_590],
        ['1.234,56', 'auto', 123_456],
        ['1,234.56', 'auto', 123_456],
        ['1.234.567', 'auto', 123_456_700],
        ['+10', 'auto', 1_000],
        ['R$ 1.000,00', ',', 100_000],
        ['1.000', ',', 100_000],
        ['1,000', '.', 100_000],
        ['10,00-', ',', -1_000],
        ['0,00', ',', 0]
    ])('lê %s no modo %s', (raw: string, mode: string, expected: number) => {
        expect(parseAmountMinor(raw, mode as ',' | '.' | 'auto', 'BRL')).toBe(expected);
    });

    it.each(['', 'abc', '1,2,3', '--5', '1e5', '99999999999999999999'])('recusa %s', (raw: string) => {
        expect(parseAmountMinor(raw, ',', 'BRL')).toBeNull();
    });

    it('respeita o expoente da moeda', () => {
        expect(parseAmountMinor('1500', 'auto', 'JPY')).toBe(1500);
    });

    it('recusa o que estoura o inteiro seguro', () => {
        expect(parseAmountMinor('999999999999999', '.', 'BRL')).toBeNull();
    });
});

describe('datas', () => {
    it('lê os quatro formatos e recusa o que não existe no calendário', () => {
        expect(parseDateWith('05/09/2026', 'dd/MM/yyyy')).toBe('2026-09-05');
        expect(parseDateWith('2026-09-05', 'yyyy-MM-dd')).toBe('2026-09-05');
        expect(parseDateWith('09/05/2026', 'MM/dd/yyyy')).toBe('2026-09-05');
        expect(parseDateWith('05/09/26', 'dd/MM/yy')).toBe('2026-09-05');
        expect(parseDateWith('31/02/2026', 'dd/MM/yyyy')).toBeNull();
        expect(parseDateWith('2026-09-05', 'dd/MM/yyyy')).toBeNull();
        expect(parseDateWith('01/01/1800', 'dd/MM/yyyy')).toBeNull();
    });

    it('usa só a data do DTPOSTED, com hora, milésimos e fuso', () => {
        expect(parseOfxDate('20260905')).toBe('2026-09-05');
        expect(parseOfxDate('20260905235959.000[-3:BRT]')).toBe('2026-09-05');
        expect(parseOfxDate('2026')).toBeNull();
        expect(parseOfxDate('20261301')).toBeNull();
    });
});

describe('texto', () => {
    it('junta NAME e MEMO sem repetir', () => {
        expect(joinDescription('LOJA', 'COMPRA', 200)).toBe('LOJA COMPRA');
        expect(joinDescription('LOJA', 'loja', 200)).toBe('LOJA');
        expect(joinDescription('', 'só memo', 200)).toBe('só memo');
        expect(joinDescription('só nome', '', 200)).toBe('só nome');
        expect(joinDescription('A', 'B'.repeat(300), 200)).toHaveLength(200);
    });

    it('corta e guarda os últimos dígitos', () => {
        expect(clip('  abcdef ', 3)).toBe('abc');
        expect(lastDigits('12345-6', 4)).toBe('3456');
        expect(lastDigits('12', 4)).toBeNull();
        expect(lastDigits(undefined, 4)).toBeNull();
    });
});
