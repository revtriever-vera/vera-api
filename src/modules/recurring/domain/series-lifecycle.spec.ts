import { describe, expect, it } from 'vitest';
import { clampName, expectedDayFor, guessCadence, isOverdue, kindOf, stopDeadline, titleCase } from './series-lifecycle';

describe('prazo da parada', () => {
    it('é a última cobrança mais a cadência vezes 1,5 mais 5 dias', () => {
        expect(stopDeadline('2026-10-05', 'monthly')).toBe('2026-11-24');
        expect(stopDeadline('2026-01-10', 'annual')).toBe('2027-07-17');
    });

    it('só está vencida depois do dia do prazo', () => {
        expect(isOverdue('2026-10-05', 'monthly', '2026-11-24')).toBe(false);
        expect(isOverdue('2026-10-05', 'monthly', '2026-11-25')).toBe(true);
    });
});

describe('tipo, nome e dia', () => {
    it('assinatura conhecida ou categoria Assinaturas é assinatura; fixas são contas; o resto é outra', () => {
        expect(kindOf(null, true, false)).toBe('subscription');
        expect(kindOf(null, false, true)).toBe('bill');
        expect(kindOf('shopping', false, true)).toBe('other');
        expect(kindOf('subscriptions', false, false)).toBe('subscription');
        expect(kindOf('home_services', false, false)).toBe('bill');
        expect(kindOf('leisure', false, false)).toBe('other');
        expect(kindOf(null, false, false)).toBe('other');
    });

    it('semanal e quinzenal não têm dia do mês', () => {
        expect(expectedDayFor('weekly', '2026-11-04')).toBeNull();
        expect(expectedDayFor('biweekly', '2026-11-04')).toBeNull();
        expect(expectedDayFor('monthly', '2026-11-04')).toBe(4);
    });

    it('capitaliza a chave do estabelecimento e limita o nome a 80 caracteres', () => {
        expect(titleCase('AMAZON  PRIME')).toBe('Amazon Prime');
        expect(clampName(`  ${'a'.repeat(100)}  `)).toHaveLength(80);
    });
});

describe('guessCadence', () => {
    it('usa a mediana dos intervalos e cai para mensal sem comparação', () => {
        expect(guessCadence(['2026-11-01'])).toBe('monthly');
        expect(guessCadence(['2026-10-01', '2026-10-08', '2026-10-15'])).toBe('weekly');
        expect(guessCadence(['2026-01-10', '2026-04-10'])).toBe('quarterly');
        expect(guessCadence(['2026-01-10', '2026-01-24', '2026-02-07'])).toBe('biweekly');
        expect(guessCadence(['2026-01-01', '2026-01-21'])).toBe('monthly');
    });
});
