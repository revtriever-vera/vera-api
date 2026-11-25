import { describe, expect, it } from 'vitest';
import { mentionsAsset } from './asset-mention';

describe('mentionsAsset', () => {
    it.each([
        'devo vender PETR4?',
        'o que é HGLG11?',
        'vale a pena o $AAPL',
        'compare AAPL com o índice',
        'quanto rende um CDB',
        'LCI ou LCA?',
        'o Tesouro Selic paga bem?',
        'qual fundo escolher',
        'um FII de papel',
        'devo comprar ETF',
        'qual ação comprar?',
        'vale investir em bitcoin',
        'which stock should I buy',
        'is crypto risky'
    ])('reconhece "%s"', (text: string) => {
        expect(mentionsAsset(text)).toBe(true);
    });

    it.each([
        'quanto gastei com delivery?',
        'como está meu fundo de emergência?',
        'how is my emergency fund',
        'qual a minha meta de economia',
        'meu CPF não aparece',
        'me lembra de pagar o condomínio'
    ])('não reconhece "%s"', (text: string) => {
        expect(mentionsAsset(text)).toBe(false);
    });
});
