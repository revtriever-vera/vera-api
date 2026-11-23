import { describe, expect, it } from 'vitest';
import { AiContext, BuiltContext, LabelSource } from './context/ai-context.types';
import { AiTextRenderer } from './context/ai-text-renderer';
import { GuardResult, figuresIn, guardSummary } from './summary-guard';

const renderer: AiTextRenderer = new AiTextRenderer();

const KEYS: ReadonlyMap<string, LabelSource> = new Map<string, LabelSource>([
    ['cat:delivery', { kind: 'cat', name: 'Delivery' }],
    ['cat:custom_1', { kind: 'cat', name: 'Pix Maria' }],
    ['cls:renda_fixa', { kind: 'cls', name: 'Renda fixa' }]
]);

const BUILT: BuiltContext<AiContext> = {
    payload: { mes: '2026-09' } as unknown as AiContext,
    numbers: [28000, 22400, 5600, 20, 25, 38, 11200, 40, 14],
    keys: KEYS
};

function guard(paragraphs: string[], locale: 'pt-BR' | 'en' = 'pt-BR'): GuardResult {
    return guardSummary({ paragraphs, built: BUILT, locale, renderer });
}

function failureOf(result: GuardResult): string {
    return result.ok ? 'ok' : result.check;
}

describe('guardSummary', () => {
    it('passa o texto do protótipo com marcadores, trocando pelos nomes', () => {
        const result: GuardResult = guard([
            'Entraram **R$ 28.000** e saíram R$ 22.400. Você guardou R$ 5.600, 20% da renda: 5 pontos abaixo da meta de 25%.',
            'A diferença veio dos gastos flexíveis: [[cat:delivery]] (+38% sobre a sua média).',
            '[[cat:custom_1]] somou R$ 11.200 em 14 transações.'
        ]);

        expect(result).toEqual({
            ok: true,
            paragraphs: [
                'Entraram **R$ 28.000** e saíram R$ 22.400. Você guardou R$ 5.600, 20% da renda: 5 pontos abaixo da meta de 25%.',
                'A diferença veio dos gastos flexíveis: Delivery (+38% sobre a sua média).',
                'Pix Maria somou R$ 11.200 em 14 transações.'
            ]
        });
    });

    it('reprova número inventado e aceita o arredondado (uma casa de tolerância)', () => {
        expect(failureOf(guard(['Você guardou R$ 7.777 no mês.']))).toBe('number');
        expect(failureOf(guard(['Você guardou R$ 5.601 no mês.']))).toBe('ok');
        expect(failureOf(guard(['A taxa foi de 19,6%.']))).toBe('ok');
        expect(failureOf(guard(['A taxa foi de 31%.']))).toBe('number');
    });

    it('conta em en pelo separador do idioma e ignora números pequenos soltos e meses', () => {
        expect(failureOf(guard(['You saved R$ 5,600 over 3 months, since 2026-09.'], 'en'))).toBe('ok');
        expect(failureOf(guard(['You saved R$ 5,601 and R$ 9,999.'], 'en'))).toBe('number');
    });

    it('aceita a diferença entre dois números do contexto só em pontos', () => {
        expect(failureOf(guard(['Ficou 5 pontos abaixo da meta.']))).toBe('ok');
        expect(failureOf(guard(['Ficou 77 pontos abaixo da meta.']))).toBe('number');
        expect(failureOf(guard(['Ficou R$ 77 abaixo da meta.']))).toBe('number');
    });

    it('reprova marcador desconhecido ou malformado', () => {
        expect(failureOf(guard(['Gastou mais em [[cat:inexistente]].']))).toBe('marker');
        expect(failureOf(guard(['Gastou mais em [[cat:delivery].']))).toBe('marker');
    });

    it('reprova venda de ativo, aceita a frase fixa do protótipo em pt-BR e en', () => {
        expect(failureOf(guard(['Venda PETR4 agora.']))).toBe('forbidden_term');
        expect(failureOf(guard(['Não precisa vender; basta não aportar nelas por um tempo.']))).toBe('ok');
        expect(failureOf(guard(["You don't need to sell; just hold off on contributing to them for a while."], 'en'))).toBe('ok');
        expect(failureOf(guard(['Você deve vender [[cls:renda_fixa]].']))).toBe('forbidden_term');
    });

    it('reprova conselho, promessa, ativo, exclamação, emoji e menção a IA', () => {
        const texts: string[] = [
            'Eu recomendo guardar mais.',
            'Isso vai render bem.',
            'A rentabilidade futura é boa.',
            'Compre mais renda fixa.',
            'Considere o Tesouro Selic.',
            'Boa notícia!',
            'Bom trabalho 🎉',
            'Como IA, eu acho.',
            'I recommend saving more.'
        ];

        texts.forEach((text: string): void => {
            expect(failureOf(guard([text]))).toBe('forbidden_term');
        });
    });

    it('reprova mais de 4 parágrafos, nenhum parágrafo e mais de 900 caracteres', () => {
        expect(failureOf(guard(['a', 'b', 'c', 'd', 'e']))).toBe('length');
        expect(failureOf(guard([]))).toBe('length');
        expect(failureOf(guard(['x'.repeat(280), 'x'.repeat(280), 'x'.repeat(280), 'x'.repeat(100)]))).toBe('length');
    });

    it('exige negrito pareado e no máximo um por parágrafo', () => {
        expect(failureOf(guard(['Sobraram **R$ 5.600** e **R$ 22.400**.']))).toBe('emphasis');
        expect(failureOf(guard(['Sobraram **R$ 5.600.']))).toBe('emphasis');
        expect(failureOf(guard(['Sobraram **R$ 5.600**.']))).toBe('ok');
    });
});

describe('figuresIn', () => {
    it('separa dinheiro, porcentagem e pontos e ignora marcadores', () => {
        const figures = figuresIn('[[cat:custom_1]] R$ 1.234,56, 12% e 3 pontos', 'pt-BR');

        expect(figures.map((figure) => [figure.value, figure.kind])).toEqual([
            [1234.56, 'money'],
            [12, 'percent'],
            [3, 'points']
        ]);
    });
});
