import { describe, expect, it } from 'vitest';
import { isRoutineCategory } from './routine-categories';

describe('isRoutineCategory', () => {
    it.each([
        'Valores Mobiliários negociados e detidos (art. 11 da Instr. CVM nº 358)',
        'Formulário Cadastral',
        'Dados cadastrais de companhias incentivadas'
    ])('treats %s as routine', (category: string) => {
        expect(isRoutineCategory(category)).toBe(true);
    });

    it.each(['Fato Relevante', 'Comunicado ao Mercado', 'Aviso aos Acionistas', ''])('does not treat %s as routine', (category: string) => {
        expect(isRoutineCategory(category)).toBe(false);
    });
});
