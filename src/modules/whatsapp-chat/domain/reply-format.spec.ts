import { describe, expect, it } from 'vitest';
import { replyTextOf } from './reply-format';

const NOTICE_PT: string = 'Isto não é uma recomendação de compra ou venda.';
const NOTICE_EN: string = 'This is not a recommendation to buy or sell.';

describe('replyTextOf', () => {
    it('resposta de carteira termina com o aviso, fora do limite de três frases', () => {
        const text: string = replyTextOf('A. B. C. D.', { locale: 'pt-BR', portfolio: true });
        expect(text).toBe(`A. B. C.\n${NOTICE_PT}`);
    });

    it('não repete o aviso que o modelo já pôs', () => {
        const text: string = replyTextOf(`A carteira está perto da meta.\n${NOTICE_EN}`, { locale: 'en', portfolio: true });
        expect(text).toBe(`A carteira está perto da meta.\n${NOTICE_EN}`);
    });

    it('gastos, agenda e lembretes não levam aviso', () => {
        expect(replyTextOf('Foram R$ 612.', { locale: 'pt-BR', portfolio: false })).toBe('Foram R$ 612.');
    });
});
