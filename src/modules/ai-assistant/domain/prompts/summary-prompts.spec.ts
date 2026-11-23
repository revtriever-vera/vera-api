import { describe, expect, it } from 'vitest';
import { AppLocale } from '../../../../shared/i18n/locale';
import { SummaryKind } from '../summary.types';
import { summarySystemPromptOf } from './summary-prompts';

const KINDS: SummaryKind[] = ['month', 'cuts', 'portfolio'];
const COMBINATIONS: [SummaryKind, AppLocale][] = KINDS.flatMap((kind: SummaryKind): [SummaryKind, AppLocale][] => [
    [kind, 'pt-BR'],
    [kind, 'en']
]);

describe('summarySystemPromptOf', () => {
    it.each(COMBINATIONS)(
        '%s em %s traz a regra de marcadores, o limite de frases e o formato de saída',
        (kind: SummaryKind, locale: AppLocale) => {
            const prompt: string = summarySystemPromptOf(kind, locale);

            expect(prompt).toContain('[[cat:');
            expect(prompt).toContain('[[cls:');
            expect(prompt).toContain('{"paragraphs"');
            expect(prompt).toMatch(locale === 'pt-BR' ? /3 ou 4 frases/ : /3 or 4 sentences/);
            expect(prompt).toContain('280');
            expect(prompt).toContain('** **');
        }
    );

    it.each(COMBINATIONS)('o exemplo de %s em %s termina em JSON válido com 1 a 4 parágrafos', (kind: SummaryKind, locale: AppLocale) => {
        const example: string = summarySystemPromptOf(kind, locale).split('\n').at(-1) ?? '';
        const parsed: { paragraphs: string[] } = JSON.parse(example) as { paragraphs: string[] };

        expect(parsed.paragraphs.length).toBeGreaterThanOrEqual(1);
        expect(parsed.paragraphs.length).toBeLessThanOrEqual(4);
    });

    it('a carteira usa a frase fixa de não vender e só fala de aporte quando ele existe', () => {
        expect(summarySystemPromptOf('portfolio', 'pt-BR')).toContain('Não precisa vender; basta não aportar nelas por um tempo.');
        expect(summarySystemPromptOf('portfolio', 'pt-BR')).toContain('só se aporte_planejado existir');
    });
});
