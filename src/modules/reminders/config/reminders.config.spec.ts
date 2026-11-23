import { describe, expect, it } from 'vitest';
import { parseRemindersConfig } from './reminders.config';

describe('parseRemindersConfig', () => {
    it('usa 20 lembretes ativos e 30 disparos por template no mês por padrão', () => {
        expect(parseRemindersConfig({})).toEqual({ REMINDERS_MAX_ACTIVE: 20, REMINDERS_MAX_TEMPLATE_SENDS_MONTH: 30 });
    });

    it('trata variável vazia como ausente e lê os valores informados', () => {
        expect(parseRemindersConfig({ REMINDERS_MAX_ACTIVE: ' ', REMINDERS_MAX_TEMPLATE_SENDS_MONTH: '5' })).toEqual({
            REMINDERS_MAX_ACTIVE: 20,
            REMINDERS_MAX_TEMPLATE_SENDS_MONTH: 5
        });
    });

    it('recusa limite de lembretes zerado', () => {
        expect(() => parseRemindersConfig({ REMINDERS_MAX_ACTIVE: '0' })).toThrow();
    });
});
