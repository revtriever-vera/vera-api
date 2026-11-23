import { describe, expect, it } from 'vitest';
import { monthlyEquivalent, nextChargeDate, stepFrom, upcomingOccurrences } from './recurring-schedule';

describe('monthlyEquivalent', () => {
    it('converte cada cadência em valor por mês', () => {
        expect(monthlyEquivalent(1200, 'weekly')).toBe(5200);
        expect(monthlyEquivalent(1200, 'biweekly')).toBe(2600);
        expect(monthlyEquivalent(1200, 'monthly')).toBe(1200);
        expect(monthlyEquivalent(1200, 'bimonthly')).toBe(600);
        expect(monthlyEquivalent(1200, 'quarterly')).toBe(400);
        expect(monthlyEquivalent(1200, 'semiannual')).toBe(200);
        expect(monthlyEquivalent(23900, 'annual')).toBe(1992);
    });
});

describe('stepFrom', () => {
    it('anda em dias nas semanais e em meses, no dia esperado, nas demais', () => {
        expect(stepFrom('2026-11-02', 'weekly', null)).toBe('2026-11-09');
        expect(stepFrom('2026-11-02', 'biweekly', null)).toBe('2026-11-16');
        expect(stepFrom('2026-10-03', 'monthly', 5)).toBe('2026-11-05');
        expect(stepFrom('2026-10-31', 'monthly', 31)).toBe('2026-11-30');
        expect(stepFrom('2026-08-15', 'quarterly', 15)).toBe('2026-11-15');
        expect(stepFrom('2025-10-10', 'annual', 10)).toBe('2026-10-10');
    });
});

describe('upcomingOccurrences', () => {
    const monthly = { cadence: 'monthly', expectedDay: 5, lastDate: '2026-11-05' } as const;

    it('lista as próximas cobranças dentro do horizonte', () => {
        expect(upcomingOccurrences(monthly, '2026-11-23', 60)).toEqual([
            { date: '2026-12-05', state: 'upcoming' },
            { date: '2027-01-05', state: 'upcoming' }
        ]);
    });

    it('a cobrança que não veio até a tolerância de 4 dias vira "não cobrou"', () => {
        const late = { cadence: 'monthly', expectedDay: 5, lastDate: '2026-10-05' } as const;

        expect(upcomingOccurrences(late, '2026-11-23', 30)).toEqual([
            { date: '2026-11-05', state: 'missed' },
            { date: '2026-12-05', state: 'upcoming' }
        ]);
    });

    it('dentro da tolerância a cobrança ainda é esperada', () => {
        const late = { cadence: 'monthly', expectedDay: 5, lastDate: '2026-10-05' } as const;

        expect(upcomingOccurrences(late, '2026-11-09', 10)[0]).toEqual({ date: '2026-11-05', state: 'upcoming' });
    });

    it('a semanal repete a cada 7 dias', () => {
        const weekly = { cadence: 'weekly', expectedDay: null, lastDate: '2026-11-20' } as const;

        expect(upcomingOccurrences(weekly, '2026-11-23', 14).map((item) => item.date)).toEqual(['2026-11-27', '2026-12-04']);
    });
});

describe('nextChargeDate', () => {
    it('pula o que já passou da tolerância', () => {
        expect(nextChargeDate({ cadence: 'monthly', expectedDay: 5, lastDate: '2026-09-05' }, '2026-11-23')).toBe('2026-12-05');
    });
});
