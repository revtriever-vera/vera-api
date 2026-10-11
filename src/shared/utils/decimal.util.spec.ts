import { describe, expect, it } from 'vitest';
import { DecimalUtil, currencyExponent, decimalStringOf, divDecimal, mulDecimal, toMinor } from './decimal.util';

describe('DecimalUtil', () => {
    it('arredonda meio para cima no inteiro', () => {
        expect(DecimalUtil.roundHalfUpToInteger('2.5')).toBe(3);
        expect(DecimalUtil.roundHalfUpToInteger('2.4999')).toBe(2);
        expect(DecimalUtil.roundHalfUpToInteger('0.5')).toBe(1);
    });

    it('calcula com precisão acima da do ponto flutuante', () => {
        expect(DecimalUtil.of('0.1').plus('0.2').toString()).toBe('0.3');
        expect(DecimalUtil.of('1.12').pow(DecimalUtil.of(126).div(252)).toFixed(10)).toBe('1.0583005244');
    });
});

describe('decimal util', () => {
    it('multiplies without float drift and converts the product to minor units', () => {
        expect(mulDecimal('37.80', '2000')).toBe('75600');
        expect(toMinor(mulDecimal('37.80', '2000'), 'BRL')).toBe(7560000);
        expect(mulDecimal('0.1', '0.2')).toBe('0.02');
    });

    it('rounds half up in minor units', () => {
        expect(toMinor('0.005', 'USD')).toBe(1);
        expect(toMinor('0.004', 'USD')).toBe(0);
        expect(toMinor('1.005', 'BRL')).toBe(101);
    });

    it('uses the ISO 4217 exponent of the currency', () => {
        expect(currencyExponent('USD')).toBe(2);
        expect(currencyExponent('JPY')).toBe(0);
        expect(toMinor('1234.5', 'JPY')).toBe(1235);
        expect(toMinor('12.5', 'USD')).toBe(1250);
    });

    it('rejects amounts beyond the safe integer range', () => {
        expect(() => toMinor('900719925474099200', 'BRL')).toThrow(RangeError);
    });

    it('divides with a fixed scale', () => {
        expect(divDecimal('1', '3', 4)).toBe('0.3333');
        expect(divDecimal('10', '4')).toBe('2.5');
    });

    it('renders numbers as plain decimal strings', () => {
        expect(decimalStringOf(62000.5)).toBe('62000.5');
        expect(decimalStringOf(0.00000123)).toBe('0.00000123');
        expect(decimalStringOf('228.1200')).toBe('228.12');
    });
});
