import { describe, expect, it } from 'vitest';
import { guardDocumentSummary, sentencesIn, signatureOf } from './market-document-summary-guard';
import { MarketDocumentSummaryOutput } from './market-document-summary.schemas';

const SOURCE: string =
    'A Companhia informa que o lucro líquido do trimestre foi de R$ 1.234,5 milhões, alta de 12,5% sobre 2025. Aprovou a venda da subsidiária Alfa S.A. por R$ 300 milhões.';

function output(summary: string, numbers: string[] = []): MarketDocumentSummaryOutput {
    return { summary, kind: 'result', relevance: 2, discard: false, numbers };
}

describe('guardDocumentSummary', () => {
    it('aceita o resumo com números copiados do texto, mesmo em outro formato de separador', () => {
        const result = guardDocumentSummary(
            output('Lucro líquido de R$ 1234,5 milhões no trimestre, alta de 12,5%.', ['1.234,5', '12,5%']),
            SOURCE
        );

        expect(result).toEqual({ ok: true });
    });

    it('reprova número que não está no documento', () => {
        const result = guardDocumentSummary(output('Lucro de R$ 987 milhões no trimestre.'), SOURCE);

        expect(result).toMatchObject({ ok: false, check: 'number' });
    });

    it('reprova número declarado em numbers que não está no documento', () => {
        const result = guardDocumentSummary(output('Lucro no trimestre.', ['R$ 777 milhões']), SOURCE);

        expect(result).toMatchObject({ ok: false, check: 'number' });
    });

    it('reprova quando passa de três frases', () => {
        const result = guardDocumentSummary(output('Houve lucro. Houve venda. Houve alta. Houve mais um fato.'), SOURCE);

        expect(result).toMatchObject({ ok: false, check: 'sentences' });
    });

    it('não confunde sigla com fim de frase nem decimal com ponto', () => {
        expect(sentencesIn('A Alfa S.A. vendeu por R$ 1.234,5 milhões. Fim.')).toBe(2);
    });

    it.each([
        'Compre agora, vale a pena.',
        'O papel vai subir com o resultado.',
        'Recomendamos a compra das ações.',
        'You should buy these shares.',
        'Ótimo resultado!',
        'A IA analisou o documento.'
    ])('reprova conselho, previsão, exclamação ou menção a IA: %s', (summary: string) => {
        expect(guardDocumentSummary(output(summary), SOURCE)).toMatchObject({ ok: false, check: 'advice' });
    });

    it('aceita "venda" como fato do emissor, que o filtro do copiloto reprovaria', () => {
        const result = guardDocumentSummary(output('A Companhia aprovou a venda da subsidiária por R$ 300 milhões.'), SOURCE);

        expect(result).toEqual({ ok: true });
    });

    it('reprova aviso de investimento escrito pelo modelo: o aviso é do código', () => {
        const result = guardDocumentSummary(output('Isto não é uma recomendação de compra ou venda.'), SOURCE);

        expect(result).toMatchObject({ ok: false, check: 'notice' });
    });

    it('normaliza o número para só dígitos', () => {
        expect(signatureOf('1.234,50')).toBe('123450');
    });
});
