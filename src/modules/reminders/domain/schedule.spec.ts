import { describe, expect, it } from 'vitest';
import {
    clippedTextOf,
    daysInMonth,
    localPartsIn,
    nextMonthlyAt,
    parseLocalAt,
    parseTimeOfDay,
    tomorrowAt,
    zonedTimeToUtc
} from './schedule';

const SAO_PAULO: string = 'America/Sao_Paulo';
const NEW_YORK: string = 'America/New_York';
const NINE: { hour: number; minute: number } = { hour: 9, minute: 0 };

describe('schedule', () => {
    it('converte o horário local para UTC no fuso da company', () => {
        const at: Date = zonedTimeToUtc(SAO_PAULO, { year: 2026, month: 11, day: 5, hour: 9, minute: 0 });

        expect(at.toISOString()).toBe('2026-11-05T12:00:00.000Z');
        expect(localPartsIn(SAO_PAULO, at)).toEqual({ year: 2026, month: 11, day: 5, hour: 9, minute: 0 });
    });

    it('respeita o horário de verão de um fuso que o tem', () => {
        const winter: Date = zonedTimeToUtc(NEW_YORK, { year: 2026, month: 1, day: 15, hour: 9, minute: 0 });
        const summer: Date = zonedTimeToUtc(NEW_YORK, { year: 2026, month: 7, day: 15, hour: 9, minute: 0 });

        expect(winter.toISOString()).toBe('2026-01-15T14:00:00.000Z');
        expect(summer.toISOString()).toBe('2026-07-15T13:00:00.000Z');
    });

    it('a próxima ocorrência mensal é neste mês quando o dia ainda não passou', () => {
        const next: Date = nextMonthlyAt(SAO_PAULO, 5, NINE, new Date('2026-11-02T15:00:00.000Z'));

        expect(next.toISOString()).toBe('2026-11-05T12:00:00.000Z');
    });

    it('a próxima ocorrência mensal vai para o mês seguinte quando o horário já passou', () => {
        const next: Date = nextMonthlyAt(SAO_PAULO, 5, NINE, new Date('2026-11-05T12:00:00.000Z'));

        expect(next.toISOString()).toBe('2026-12-05T12:00:00.000Z');
    });

    it('vira o ano em dezembro', () => {
        const next: Date = nextMonthlyAt(SAO_PAULO, 5, NINE, new Date('2026-12-20T12:00:00.000Z'));

        expect(next.toISOString()).toBe('2027-01-05T12:00:00.000Z');
    });

    it('o dia 31 cai no último dia do mês curto', () => {
        const february: Date = nextMonthlyAt(SAO_PAULO, 31, NINE, new Date('2026-02-10T12:00:00.000Z'));
        const leap: Date = nextMonthlyAt(SAO_PAULO, 31, NINE, new Date('2028-02-10T12:00:00.000Z'));
        const april: Date = nextMonthlyAt(SAO_PAULO, 31, NINE, new Date('2026-03-31T13:00:00.000Z'));

        expect(february.toISOString()).toBe('2026-02-28T12:00:00.000Z');
        expect(leap.toISOString()).toBe('2028-02-29T12:00:00.000Z');
        expect(april.toISOString()).toBe('2026-04-30T12:00:00.000Z');
    });

    it('usa o dia local e não o do UTC perto da meia-noite', () => {
        const next: Date = nextMonthlyAt(SAO_PAULO, 1, NINE, new Date('2026-11-30T23:30:00.000Z'));

        expect(next.toISOString()).toBe('2026-12-01T12:00:00.000Z');
    });

    it('amanhã é a mesma hora no dia local seguinte, mesmo depois da meia-noite em UTC', () => {
        const at: Date = tomorrowAt(SAO_PAULO, NINE, new Date('2026-11-05T23:30:00.000Z'));

        expect(at.toISOString()).toBe('2026-11-06T12:00:00.000Z');
    });

    it('amanhã atravessa a virada do horário de verão de outro fuso', () => {
        const at: Date = tomorrowAt(NEW_YORK, NINE, new Date('2026-03-07T20:00:00.000Z'));

        expect(at.toISOString()).toBe('2026-03-08T13:00:00.000Z');
    });

    it('conta os dias do mês', () => {
        expect(daysInMonth(2026, 2)).toBe(28);
        expect(daysInMonth(2028, 2)).toBe(29);
        expect(daysInMonth(2026, 12)).toBe(31);
    });

    it('lê a hora e recusa a malformada, com 09:00 por padrão', () => {
        expect(parseTimeOfDay(undefined)).toEqual(NINE);
        expect(parseTimeOfDay('18:30')).toEqual({ hour: 18, minute: 30 });
        expect(parseTimeOfDay('24:00')).toBeNull();
        expect(parseTimeOfDay('9h')).toBeNull();
    });

    it('lê a data local com ou sem hora e recusa data inexistente', () => {
        expect(parseLocalAt('2026-11-05', NINE)).toEqual({ year: 2026, month: 11, day: 5, hour: 9, minute: 0 });
        expect(parseLocalAt('2026-11-05T18:45', NINE)).toEqual({ year: 2026, month: 11, day: 5, hour: 18, minute: 45 });
        expect(parseLocalAt('2026-02-30', NINE)).toBeNull();
        expect(parseLocalAt('amanhã', NINE)).toBeNull();
    });

    it('corta o texto em 120 caracteres e tira links', () => {
        expect(clippedTextOf('x'.repeat(300))).toHaveLength(120);
        expect(clippedTextOf('  pagar  a  fatura ')).toBe('pagar a fatura');
        expect(clippedTextOf('ver https://exemplo.com/x e www.banco.com.br agora')).toBe('ver e agora');
        expect(clippedTextOf('abrir banco.com/login hoje')).toBe('abrir hoje');
    });
});
