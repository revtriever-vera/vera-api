import { describe, expect, it } from 'vitest';
import { ReminderInvalidScheduleError } from './reminders.errors';
import { ReminderRequest, resolveReminder } from './reminder-request';

const NOW: Date = new Date('2026-11-05T15:00:00.000Z');
const ZONE: string = 'America/Sao_Paulo';

function resolve(request: Partial<ReminderRequest>): ReturnType<typeof resolveReminder> {
    return resolveReminder({ text: 'pagar a fatura', kind: 'once', ...request }, ZONE, NOW);
}

describe('resolveReminder', () => {
    it('resolve um lembrete único com data e hora no fuso da company', () => {
        const resolved = resolve({ at: '2026-11-06T18:30' });

        expect(resolved.onceAt?.toISOString()).toBe('2026-11-06T21:30:00.000Z');
        expect(resolved.timeOfDay).toBe('18:30');
        expect(resolved.dayOfMonth).toBeNull();
    });

    it('usa 09:00 quando só a data vem', () => {
        expect(resolve({ at: '2026-11-06' }).timeOfDay).toBe('09:00');
        expect(resolve({ at: '2026-11-06', time: '07:15' }).timeOfDay).toBe('07:15');
    });

    it('resolve o mensal com o dia e a hora padrão', () => {
        const resolved = resolve({ kind: 'monthly', dayOfMonth: 5 });

        expect(resolved).toMatchObject({ kind: 'monthly', onceAt: null, dayOfMonth: 5, timeOfDay: '09:00', timezone: ZONE });
    });

    it('corta o texto e tira links', () => {
        const resolved = resolve({ at: '2026-11-06', text: `${'a'.repeat(200)} https://x.com` });

        expect(resolved.text).toHaveLength(120);
        expect(resolved.text).not.toContain('http');
    });

    it.each([
        ['data no passado', { at: '2026-11-05T11:00' }, 'past'],
        ['data ausente', {}, 'at'],
        ['data inexistente', { at: '2026-02-30' }, 'at'],
        ['mensal sem dia', { kind: 'monthly' as const }, 'dayOfMonth'],
        ['dia 32', { kind: 'monthly' as const, dayOfMonth: 32 }, 'dayOfMonth'],
        ['hora inválida', { at: '2026-11-06', time: '25:00' }, 'time'],
        ['texto vazio', { at: '2026-11-06', text: 'https://x.com' }, 'text']
    ])('recusa %s', (_label, request, reason) => {
        expect(() => resolve(request)).toThrow(ReminderInvalidScheduleError);
        try {
            resolve(request);
        } catch (error: unknown) {
            expect((error as ReminderInvalidScheduleError).meta).toEqual({ reason });
        }
    });
});
