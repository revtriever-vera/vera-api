import { describe, expect, it } from 'vitest';
import { chatTextsFor, pausedText } from './fixed-replies';

describe('textos fixos', () => {
    it('trazem as frases do card em pt-BR', () => {
        const texts = chatTextsFor('pt-BR');
        expect(texts.unlinked).toBe('Este número não está vinculado a uma conta da Vera. Vincule em Configurações › WhatsApp.');
        expect(texts.unsupported).toBe('Por enquanto a Vera lê só texto.');
        expect(texts.premiumEnded).toBe('O Premium desta conta terminou. A Vera parou de responder por aqui.');
        expect(texts.limited).toBe('Muitas perguntas seguidas. Tente de novo em alguns minutos.');
        expect(texts.expiredConfirmation).toBe('Essa confirmação venceu. Peça de novo.');
        expect(texts.unavailable).toBe('A Vera não conseguiu responder agora. Tente de novo em alguns minutos.');
        expect(pausedText('pt-BR', 'dezembro')).toBe('Cota do mês esgotada. A Vera volta a responder em 1º de dezembro.');
    });

    it('têm a mesma chave em en, com texto próprio', () => {
        const pt = chatTextsFor('pt-BR');
        const en = chatTextsFor('en');
        expect(Object.keys(en)).toEqual(Object.keys(pt));
        for (const key of Object.keys(en) as (keyof typeof en)[]) {
            expect(en[key]).not.toBe(pt[key]);
        }
        expect(pausedText('en', 'December')).toBe('Monthly quota used up. Vera will answer again on December 1.');
    });
});
