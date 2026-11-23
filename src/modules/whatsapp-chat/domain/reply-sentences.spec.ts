import { describe, expect, it } from 'vitest';
import { limitSentences } from './reply-sentences';

describe('limitSentences', () => {
    it('corta em três frases', () => {
        expect(limitSentences('Um. Dois. Três. Quatro. Cinco.', 3)).toBe('Um. Dois. Três.');
    });

    it('não quebra número nem moeda no meio', () => {
        const text: string = 'Em setembro foram R$ 1.612,50 em delivery. Isso é 38,5% acima da média de R$ 443,00. Boa. Corte.';
        expect(limitSentences(text, 3)).toBe('Em setembro foram R$ 1.612,50 em delivery. Isso é 38,5% acima da média de R$ 443,00. Boa.');
    });

    it('lista fica de fora do limite', () => {
        const text: string = 'Resumo. Segue.\n- Delivery: R$ 612\n- Mercado: R$ 900\n- Transporte: R$ 200\nFim. Extra. Demais.';
        expect(limitSentences(text, 3)).toBe('Resumo. Segue.\n- Delivery: R$ 612\n- Mercado: R$ 900\n- Transporte: R$ 200\nFim.');
    });

    it('texto curto passa inteiro', () => {
        expect(limitSentences('Tudo certo.', 3)).toBe('Tudo certo.');
    });
});
