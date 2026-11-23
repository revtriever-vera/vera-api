import { describe, expect, it } from 'vitest';
import { goalMetText } from './summary-fixed-texts';

describe('goalMetText', () => {
    it('pt-BR: texto do protótipo com a meta e a sobra', () => {
        expect(goalMetText({ goalBps: 2500, surplusMinor: 120_000, currency: 'BRL' }, 'pt-BR')).toEqual([
            'Você já guarda mais que a meta de 25%: sobram **R$ 1.200** acima dela. Não precisa cortar nada; esse dinheiro pode ir para o aporte.'
        ]);
    });

    it('en: mesma regra de tom, no idioma', () => {
        const [text]: readonly string[] = goalMetText({ goalBps: 2500, surplusMinor: 120_000, currency: 'BRL' }, 'en');

        expect(text).toBe(
            'You already save more than your 25% goal: **R$1,200** is left above it. There is nothing to cut; that money can go to your next contribution.'
        );
        expect(text).not.toContain('!');
    });
});
