import { describe, expect, it } from 'vitest';
import { formatMoney } from './format-money';

describe('formatMoney', () => {
    it('formata centavos em reais no idioma da pessoa', () => {
        expect(formatMoney(24780, 'pt-BR').replace(/\s/g, ' ')).toBe('R$ 247,80');
        expect(formatMoney(24780, 'en').replace(/\s/g, ' ')).toBe('R$247.80');
    });

    it('reaproveita o formatador do idioma', () => {
        expect(formatMoney(100, 'pt-BR')).toBe(formatMoney(100, 'pt-BR'));
    });
});
