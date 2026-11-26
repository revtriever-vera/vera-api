import { describe, expect, it } from 'vitest';
import { moneyText, percentText, pointsText, priceText, signedPercentText } from './money-text';

describe('texto de dinheiro e percentual', () => {
    it('formata em pt-BR sem centavos e com espaço comum', () => {
        expect(moneyText(164_000, 'BRL', 'pt-BR')).toBe('R$ 1.640');
        expect(moneyText(-250_000, 'BRL', 'pt-BR')).toBe('-R$ 2.500');
        expect(percentText(2300, 'pt-BR')).toBe('23%');
        expect(signedPercentText(933, 'pt-BR')).toBe('+9%');
        expect(signedPercentText(-1200, 'pt-BR')).toBe('-12%');
        expect(signedPercentText(0, 'pt-BR')).toBe('0%');
        expect(pointsText(500, 'pt-BR')).toBe('5 pp');
        expect(pointsText(250, 'pt-BR')).toBe('2,5 pp');
    });

    it('formata em en com a moeda dos dados', () => {
        expect(moneyText(164_000, 'BRL', 'en')).toBe('R$1,640');
        expect(moneyText(164_000, 'USD', 'en')).toBe('$1,640');
        expect(percentText(2300, 'en')).toBe('23%');
        expect(pointsText(250, 'en')).toBe('2.5 pp');
    });
});

describe('texto de preço', () => {
    it('mostra centavos e, abaixo de 1, até quatro casas', () => {
        expect(priceText('38.5', 'BRL', 'pt-BR')).toBe('R$ 38,50');
        expect(priceText('1234.567', 'BRL', 'pt-BR')).toBe('R$ 1.234,57');
        expect(priceText('0.0312', 'BRL', 'pt-BR')).toBe('R$ 0,0312');
        expect(priceText('189.2', 'USD', 'en')).toBe('$189.20');
    });
});
