import { describe, expect, it } from 'vitest';
import { addDays, dueInstant, mondayOnOrAfter, nextWeekSlot, sendInstant, weekdayIndexOf } from './notice-dates';

const SAO_PAULO: string = 'America/Sao_Paulo';

describe('notice-dates', () => {
    it('soma dias e acha o dia da semana', () => {
        expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
        expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
        expect(weekdayIndexOf('2026-11-23')).toBe(1);
        expect(weekdayIndexOf('2026-11-29')).toBe(0);
    });

    it('acha a segunda-feira do dia ou a seguinte', () => {
        expect(mondayOnOrAfter('2026-11-23')).toBe('2026-11-23');
        expect(mondayOnOrAfter('2026-11-24')).toBe('2026-11-30');
        expect(mondayOnOrAfter('2026-11-29')).toBe('2026-11-30');
    });

    it('marca 09:00 no fuso da company', () => {
        expect(sendInstant(SAO_PAULO, '2026-11-23').toISOString()).toBe('2026-11-23T12:00:00.000Z');
        expect(sendInstant('Asia/Tokyo', '2026-11-23').toISOString()).toBe('2026-11-23T00:00:00.000Z');
        expect(sendInstant('Pacific/Kiritimati', '2026-11-23').toISOString()).toBe('2026-11-22T19:00:00.000Z');
        expect(sendInstant('Pacific/Pago_Pago', '2026-11-23').toISOString()).toBe('2026-11-23T20:00:00.000Z');
    });

    it('a véspera sai às 09:00 do dia anterior ao débito', () => {
        expect(dueInstant(SAO_PAULO, '2026-11-25').toISOString()).toBe('2026-11-24T12:00:00.000Z');
    });

    it('a segunda de hoje vale antes das 09:00 e a seguinte depois', () => {
        const before: Date = new Date('2026-11-23T11:00:00Z');
        const after: Date = new Date('2026-11-23T12:00:01Z');
        expect(nextWeekSlot(SAO_PAULO, before).monday).toBe('2026-11-23');
        expect(nextWeekSlot(SAO_PAULO, after).monday).toBe('2026-11-30');
        expect(nextWeekSlot(SAO_PAULO, new Date('2026-11-25T15:00:00Z')).at.toISOString()).toBe('2026-11-30T12:00:00.000Z');
    });
});
