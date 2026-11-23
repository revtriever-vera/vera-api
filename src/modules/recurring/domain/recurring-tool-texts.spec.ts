import { describe, expect, it } from 'vitest';
import { daysUntilSunday, subscriptionsText, weekdayIndexOf, weekText, WeekDebit } from './recurring-tool-texts';

const SEGURO: WeekDebit = { name: 'Seguro do carro', date: '2026-11-27', amountMinor: 38900, isEstimate: false };
const NETFLIX: WeekDebit = { name: 'Netflix', date: '2026-11-25', amountMinor: 5590, isEstimate: false };
const LUZ: WeekDebit = { name: 'Enel', date: '2026-11-28', amountMinor: 18200, isEstimate: true };

function plain(text: string): string {
    return text.replace(/\s/g, ' ');
}

describe('recurring-tool-texts', () => {
    it('conta os dias até o domingo', () => {
        expect(weekdayIndexOf('2026-11-23')).toBe(1);
        expect(daysUntilSunday('2026-11-23')).toBe(6);
        expect(daysUntilSunday('2026-11-29')).toBe(0);
        expect(daysUntilSunday('2026-11-28')).toBe(1);
    });

    it('resume a semana com o total, a quantidade e o maior débito', () => {
        expect(plain(weekText([NETFLIX, SEGURO], 'pt-BR'))).toBe(
            'R$ 444,90 em 2 débitos até domingo. O maior é Seguro do carro, R$ 389,00, na sexta.'
        );
        expect(plain(weekText([NETFLIX], 'pt-BR'))).toBe('R$ 55,90 em 1 débito até domingo. O maior é Netflix, R$ 55,90, na quarta.');
        expect(plain(weekText([NETFLIX, SEGURO], 'en'))).toBe(
            'R$444.90 in 2 debits until Sunday. The biggest is Seguro do carro, R$389.00, on Friday.'
        );
    });

    it('avisa quando algum valor é estimado e quando não há débito', () => {
        expect(plain(weekText([LUZ], 'pt-BR'))).toBe(
            'R$ 182,00 em 1 débito até domingo. O maior é Enel, R$ 182,00, no sábado. Alguns valores são estimados.'
        );
        expect(plain(weekText([LUZ], 'en'))).toContain('Some amounts are estimates.');
        expect(weekText([], 'pt-BR')).toBe('Você não tem débitos recorrentes até domingo.');
        expect(weekText([], 'en')).toBe('You have no recurring debits until Sunday.');
    });

    it('responde quanto custam as assinaturas por mês e por ano', () => {
        expect(plain(subscriptionsText({ monthlyMinor: 31200, yearlyMinor: 374400, count: 9 }, 'pt-BR'))).toBe(
            'R$ 312,00 por mês em 9 assinaturas, R$ 3.744,00 por ano.'
        );
        expect(plain(subscriptionsText({ monthlyMinor: 5590, yearlyMinor: 67080, count: 1 }, 'en'))).toBe(
            'R$55.90 per month in 1 subscription, R$670.80 per year.'
        );
        expect(subscriptionsText({ monthlyMinor: 0, yearlyMinor: 0, count: 0 }, 'pt-BR')).toBe(
            'Você ainda não confirmou nenhuma assinatura.'
        );
        expect(subscriptionsText({ monthlyMinor: 0, yearlyMinor: 0, count: 0 }, 'en')).toBe('You have not confirmed any subscription yet.');
    });
});
