import { describe, expect, it } from 'vitest';
import { calendarTextsFor } from './calendar-texts';

const START: Date = new Date('2026-10-13T13:00:00.000Z');

describe('calendarTextsFor', () => {
    it('formata a linha da lista como no protótipo', () => {
        expect(
            calendarTextsFor('pt-BR').eventLine(
                { title: 'Revisão da carteira com a Ana', start: START, allDay: false },
                'America/Sao_Paulo'
            )
        ).toBe('• ter 13/10, 10:00: Revisão da carteira com a Ana');
    });

    it('mostra só o dia no evento de dia inteiro, sem deslocar pelo fuso', () => {
        expect(
            calendarTextsFor('pt-BR').eventLine(
                { title: 'Feriado', start: new Date('2026-10-12T00:00:00.000Z'), allDay: true },
                'America/Sao_Paulo'
            )
        ).toBe('• seg 12/10: Feriado');
    });

    it('responde a criação e o cancelamento no tom da Vera', () => {
        const texts = calendarTextsFor('pt-BR');

        expect(texts.created('Revisão', START, 'America/Sao_Paulo')).toBe('Reunião criada no Google Agenda: Revisão, ter 13/10 às 10:00.');
        expect(texts.canceled).toBe('Reunião não criada.');
        expect(texts.notConnected).toContain('Configurações › Google Agenda');
    });

    it('tem a versão em inglês', () => {
        expect(calendarTextsFor('en').created('Review', START, 'America/Sao_Paulo')).toBe(
            'Meeting created in Google Calendar: Review, Tue 10/13 at 10:00.'
        );
    });
});
