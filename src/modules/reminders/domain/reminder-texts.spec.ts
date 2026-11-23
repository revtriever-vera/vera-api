import { describe, expect, it } from 'vitest';
import { reminderTextsFor, whenOf } from './reminder-texts';

const NOW: Date = new Date('2026-11-05T15:00:00.000Z');
const ZONE: string = 'America/Sao_Paulo';

describe('reminder texts', () => {
    it('descreve o mensal e o único em pt-BR', () => {
        const monthly = { kind: 'monthly', onceAt: null, dayOfMonth: 5, timeOfDay: '09:00', timezone: ZONE };

        expect(whenOf(monthly, 'pt-BR', NOW)).toBe('todo dia 5 às 09:00');
        expect(whenOf({ ...monthly, kind: 'once', onceAt: new Date('2026-11-05T21:00:00.000Z') }, 'pt-BR', NOW)).toBe('hoje às 18:00');
        expect(whenOf({ ...monthly, kind: 'once', onceAt: new Date('2026-11-06T12:00:00.000Z') }, 'pt-BR', NOW)).toBe('amanhã às 09:00');
        expect(whenOf({ ...monthly, kind: 'once', onceAt: new Date('2026-11-20T12:00:00.000Z') }, 'pt-BR', NOW)).toBe('dia 20/11 às 09:00');
    });

    it('descreve em inglês com a data do mês na frente', () => {
        const once = { kind: 'once', onceAt: new Date('2026-11-20T12:00:00.000Z'), dayOfMonth: null, timeOfDay: '09:00', timezone: ZONE };

        expect(whenOf(once, 'en', NOW)).toBe('on 11/20 at 09:00');
        expect(whenOf({ ...once, kind: 'monthly', dayOfMonth: 5 }, 'en', NOW)).toBe('every month on day 5 at 09:00');
    });

    it('confirma a criação no tom combinado', () => {
        expect(reminderTextsFor('pt-BR').created('Fazer o aporte do mês', 'todo dia 5 às 09:00')).toBe(
            'Lembrete criado: Fazer o aporte do mês, todo dia 5 às 09:00. Para ver ou apagar, mande "meus lembretes".'
        );
    });

    it('monta a lista numerada e as recusas', () => {
        const texts = reminderTextsFor('pt-BR');

        expect(texts.listItem(2, 'Pagar', 'amanhã às 09:00')).toBe('2. Pagar, amanhã às 09:00');
        expect(texts.listEmpty).toBe('Você não tem lembretes. É só pedir: "me lembra de aportar todo dia 5".');
        expect(texts.limitReached(20)).toBe('Você já tem 20 lembretes. Apague algum em "meus lembretes".');
    });

    it('os títulos dos botões cabem nos 20 caracteres do WhatsApp', () => {
        const titles: string[] = (['pt-BR', 'en'] as const).flatMap((locale): string[] => Object.values(reminderTextsFor(locale).buttons));
        for (const title of titles) {
            expect(title.length).toBeLessThanOrEqual(20);
        }
    });
});
