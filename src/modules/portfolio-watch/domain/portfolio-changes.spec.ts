import { describe, expect, it } from 'vitest';
import type { PublicDocumentView } from '../../market-documents/services/market-documents-reader.service';
import { changeItemsOf, weightLineOf } from './portfolio-changes';
import { HeldAsset } from './portfolio-changes.types';

const HELD: ReadonlyMap<string, HeldAsset> = new Map<string, HeldAsset>([
    ['big', { assetId: 'big', symbol: 'BIGG11', weightBps: 800 }],
    ['small', { assetId: 'small', symbol: 'SMLL3', weightBps: 100 }],
    ['novalue', { assetId: 'novalue', symbol: 'NOVL3', weightBps: null }]
]);

function document(id: string, assetIds: string[], day: string, relevance: number | null): PublicDocumentView {
    return {
        id,
        source: 'cvm_ipe',
        category: 'relevant_fact',
        title: `Documento ${id}`,
        publishedAt: new Date(`${day}T12:00:00Z`),
        url: `https://example.com/${id}`,
        assetIds,
        summary: relevance === null ? null : { text: `Resumo ${id}`, kind: 'relevant_fact', relevance, locale: 'pt-BR' }
    };
}

describe('weightLineOf', () => {
    it('escreve a frase do peso em pt-BR e em inglês', () => {
        expect(weightLineOf('XPLG11', 800, 'pt-BR')).toBe('XPLG11 é 8% da sua carteira.');
        expect(weightLineOf('XPLG11', 850, 'pt-BR')).toBe('XPLG11 é 8,5% da sua carteira.');
        expect(weightLineOf('XPLG11', 800, 'en')).toBe('XPLG11 is 8% of your portfolio.');
    });

    it('peso abaixo de 0,1% vira "menos de 0,1%" e sem valor não gera frase', () => {
        expect(weightLineOf('XPLG11', 5, 'pt-BR')).toBe('XPLG11 é menos de 0,1% da sua carteira.');
        expect(weightLineOf('XPLG11', null, 'pt-BR')).toBeNull();
    });
});

describe('changeItemsOf', () => {
    it('ordena por relevância x peso e desempata pela data mais nova', () => {
        const items = changeItemsOf(
            [
                document('d1', ['small'], '2026-12-05', 3),
                document('d2', ['big'], '2026-12-01', 1),
                document('d3', ['big'], '2026-12-04', 1),
                document('d4', ['small'], '2026-12-06', 0)
            ],
            HELD,
            'pt-BR'
        );

        expect(items.map((item) => item.id)).toEqual(['d3', 'd2', 'd1', 'd4']);
    });

    it('aviso reenviado como versão corrigida (mesmo ativo, fonte, categoria e dia) aparece uma vez, a versão mais nova', () => {
        const original: PublicDocumentView = document('d1', ['big'], '2026-12-05', 2);
        const corrected: PublicDocumentView = {
            ...document('d2', ['big'], '2026-12-05', 2),
            publishedAt: new Date('2026-12-05T15:00:00Z')
        };
        const otherDay: PublicDocumentView = document('d3', ['big'], '2026-12-04', 2);
        const otherAsset: PublicDocumentView = document('d4', ['small'], '2026-12-05', 2);

        const items = changeItemsOf([corrected, original, otherDay, otherAsset], HELD, 'pt-BR');

        expect(items.map((item) => item.id).sort()).toEqual(['d2', 'd3', 'd4']);
    });

    it('documento de mais de um ativo da conta aparece uma vez, no mais pesado', () => {
        const [item, ...rest] = changeItemsOf([document('d1', ['small', 'big'], '2026-12-05', 2)], HELD, 'pt-BR');

        expect(rest).toEqual([]);
        expect(item).toMatchObject({ assetId: 'big', symbol: 'BIGG11', weightBps: 800, weightLine: 'BIGG11 é 8% da sua carteira.' });
    });

    it('documento sem resumo mostra título e link, com o texto de resumo indisponível e sem relevância', () => {
        const [item] = changeItemsOf([document('d1', ['novalue'], '2026-12-05', null)], HELD, 'pt-BR');

        expect(item).toMatchObject({
            summary: 'Resumo indisponível',
            summaryAvailable: false,
            relevance: null,
            kind: null,
            weightBps: null,
            weightLine: null,
            documentUrl: 'https://example.com/d1',
            title: 'Documento d1',
            date: '2026-12-05'
        });
    });

    it('ignora documento de ativo que a conta não tem', () => {
        expect(changeItemsOf([document('d1', ['other'], '2026-12-05', 3)], HELD, 'en')).toEqual([]);
    });

    it('em inglês o resumo indisponível e a frase saem em inglês', () => {
        const [item] = changeItemsOf([document('d1', ['big'], '2026-12-05', null)], HELD, 'en');

        expect(item).toMatchObject({ summary: 'Summary unavailable', weightLine: 'BIGG11 is 8% of your portfolio.' });
    });
});
