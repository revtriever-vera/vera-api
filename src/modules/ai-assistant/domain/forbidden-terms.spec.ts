import { describe, expect, it } from 'vitest';
import { adviceIn, assetKeysIn, forbiddenTermIn } from './forbidden-terms';

describe('forbiddenTermIn', () => {
    it('aceita o nome de ativo que veio da pergunta ou da ferramenta', () => {
        expect(forbiddenTermIn('PETR4 pesa 18% da carteira', new Set(['petr4']))).toBe(false);
        expect(forbiddenTermIn('Um CDB é renda fixa', new Set(['cdb']))).toBe(false);
        expect(forbiddenTermIn('O Tesouro Selic é um título público', new Set(['tesouro']))).toBe(false);
    });

    it('reprova ticker inventado e nome de ativo sem origem', () => {
        expect(forbiddenTermIn('VALE3 pesa 18%', new Set(['petr4']))).toBe(true);
        expect(forbiddenTermIn('Um CDB é renda fixa')).toBe(true);
    });

    it('reprova conselho mesmo quando o ativo é conhecido', () => {
        const known: ReadonlySet<string> = new Set(['petr4']);
        for (const text of [
            'Compre PETR4.',
            'Venda suas ações de PETR4',
            'Venda já',
            'Troque PETR4 por outro',
            'Eu recomendo PETR4',
            'Vale a pena comprar PETR4',
            'PETR4 vai render muito',
            'A rentabilidade futura é boa',
            'Mantenha PETR4',
            'You should buy PETR4',
            'Sell PETR4'
        ]) {
            expect(forbiddenTermIn(text, known), text).toBe(true);
        }
    });

    it('não reprova o texto fixo do aviso, nos dois idiomas', () => {
        expect(forbiddenTermIn('Isto não é uma recomendação de compra ou venda.')).toBe(false);
        expect(forbiddenTermIn('This is not a recommendation to buy or sell.')).toBe(false);
        expect(adviceIn('Isto não é uma recomendação de compra ou venda. Compre.')).toBe(true);
    });

    it('mantém exclamação, emoji e menção a IA reprovados', () => {
        expect(forbiddenTermIn('Ótimo!')).toBe(true);
        expect(forbiddenTermIn('Foram R$ 3.200 😀')).toBe(true);
        expect(forbiddenTermIn('A IA diz que sim')).toBe(true);
    });
});

describe('assetKeysIn', () => {
    it('normaliza a chave de cada ativo citado', () => {
        expect(assetKeysIn('Tesouro Selic, CDB e PETR4')).toEqual(['tesouro', 'cdb', 'petr4']);
    });
});
