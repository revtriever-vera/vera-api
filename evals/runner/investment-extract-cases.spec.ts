import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    noteCasesOf,
    noteCatalogOf,
    noteFileOf,
    NoteCase,
    problemsOfNoteStatement,
    statementOfNoteAnswer
} from './investment-extract-cases';

const CASES: NoteCase[] = noteCasesOf();

describe('investment_extract note cases', () => {
    it('cobre cada situação do card', () => {
        const ids: string[] = CASES.map((item: NoteCase): string => item.id);

        expect(ids).toEqual(
            expect.arrayContaining([
                'nota-sinacor-classico',
                'nota-varias-notas',
                'nota-day-trade',
                'nota-fii',
                'nota-etf',
                'nota-bdr',
                'nota-opcao',
                'nota-total-nao-bate',
                'nota-escaneada',
                'nota-envenenada'
            ])
        );
        expect(CASES.filter((item: NoteCase): boolean => item.input === 'image').map((item: NoteCase): string => item.id)).toEqual([
            'nota-escaneada'
        ]);
    });

    it.each(CASES.map((item: NoteCase): [string, NoteCase] => [item.id, item]))(
        '%s: a resposta de referência do modelo vira as linhas do gabarito',
        (_id: string, item: NoteCase) => {
            const statement = statementOfNoteAnswer(JSON.stringify(item.modelAnswer), noteCatalogOf());

            expect(problemsOfNoteStatement(item, statement)).toEqual([]);
        }
    );

    it('o arquivo de cada caso existe e nenhum caso leva dado pessoal além do inventado', () => {
        for (const item of CASES) {
            expect(noteFileOf(item).byteLength).toBeGreaterThan(0);
            expect(JSON.stringify(item.modelAnswer)).not.toMatch(/PESSOA EXEMPLO|123\.456\.789-00|9000001/);
        }
    });

    it('o catálogo dos casos é público (símbolos de B3) e sem CPF válido', () => {
        const text: string = readFileSync(new URL('../cases/investment_extract/catalog.json', `file://${__dirname}/`), 'utf8');

        expect(text).toContain('PETR4');
        expect(text).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
    });
});
