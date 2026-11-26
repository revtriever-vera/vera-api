import { describe, expect, it } from 'vitest';
import { questionTextOf, withoutFileLine } from './attachment-line';

describe('linha do arquivo na pergunta guardada', () => {
    it('guarda só o nome do arquivo quando a pessoa não escreveu nada', () => {
        expect(questionTextOf(undefined, 'nota.pdf')).toBe('Arquivo: nota.pdf');
    });

    it('guarda o texto da pessoa e o nome do arquivo em outra linha', () => {
        expect(questionTextOf('importa isso', 'nota.pdf')).toBe('importa isso\nArquivo: nota.pdf');
    });

    it('sem arquivo guarda o texto como veio', () => {
        expect(questionTextOf('oi', null)).toBe('oi');
    });

    it('tira a linha do arquivo antes de a pergunta ir ao modelo', () => {
        expect(withoutFileLine('importa isso\nArquivo: nota.pdf')).toBe('importa isso');
        expect(withoutFileLine('Arquivo: nota.pdf')).toBe('');
        expect(withoutFileLine('oi')).toBe('oi');
    });
});
