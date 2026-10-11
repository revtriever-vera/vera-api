import { describe, expect, it } from 'vitest';
import { AVERAGE_PRICE_PATTERN, QUANTITY_PATTERN } from './positions.types';
import { decimalPlaces, fitsDecimals, normalizeDecimal } from './quantity';

const TESOURO_DECIMALS: number = 2;
const CRYPTO_DECIMALS: number = 8;
const B3_DECIMALS: number = 0;

describe('quantity', () => {
    it('respeita as casas decimais de cada mercado', () => {
        expect(fitsDecimals('3.2', TESOURO_DECIMALS)).toBe(true);
        expect(fitsDecimals('3.205', TESOURO_DECIMALS)).toBe(false);
        expect(fitsDecimals('0.45', CRYPTO_DECIMALS)).toBe(true);
        expect(fitsDecimals('2000.5', B3_DECIMALS)).toBe(false);
        expect(fitsDecimals('2000', B3_DECIMALS)).toBe(true);
        expect(fitsDecimals('0', B3_DECIMALS)).toBe(true);
    });

    it('conta as casas decimais', () => {
        expect(decimalPlaces('10')).toBe(0);
        expect(decimalPlaces('10.125')).toBe(3);
    });

    it('aceita zero e decimais válidos e rejeita negativo, vazio, notação científica e vírgula', () => {
        expect(
            ['0', '40', '3.2', '0.0000000001', '999999999999999999.9999999999'].every((value: string) => QUANTITY_PATTERN.test(value))
        ).toBe(true);
        expect(
            ['-1', '', '1e3', '1,5', '1.', '.5', '1.12345678901', '1234567890123456789', ' 1'].some((value: string) =>
                QUANTITY_PATTERN.test(value)
            )
        ).toBe(false);
    });

    it('valida o preço médio com oito casas', () => {
        expect(AVERAGE_PRICE_PATTERN.test('37.80')).toBe(true);
        expect(AVERAGE_PRICE_PATTERN.test('0')).toBe(true);
        expect(AVERAGE_PRICE_PATTERN.test('1.123456789')).toBe(false);
        expect(AVERAGE_PRICE_PATTERN.test('-1')).toBe(false);
    });

    it('normaliza o decimal devolvido pelo banco sem zeros à direita', () => {
        expect(normalizeDecimal('40.0000000000')).toBe('40');
        expect(normalizeDecimal('3.2500000000')).toBe('3.25');
        expect(normalizeDecimal('0.0000000000')).toBe('0');
        expect(normalizeDecimal('100')).toBe('100');
    });

    it('normaliza decimais preservando o comportamento anterior', () => {
        expect(normalizeDecimal('10')).toBe('10');
        expect(normalizeDecimal('10.50')).toBe('10.5');
        expect(normalizeDecimal('10.00')).toBe('10');
        expect(normalizeDecimal('100.000')).toBe('100');
        expect(normalizeDecimal('0.0')).toBe('0');
        expect(normalizeDecimal('0.10')).toBe('0.1');
        expect(normalizeDecimal('1.')).toBe('1');
        expect(normalizeDecimal(`1.${'0'.repeat(100_000)}`)).toBe('1');
    });
});
