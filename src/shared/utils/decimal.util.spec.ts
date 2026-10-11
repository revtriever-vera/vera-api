import { describe, expect, it } from 'vitest';
import { DecimalUtil } from './decimal.util';

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
