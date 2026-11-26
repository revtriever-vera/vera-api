import { describe, expect, it } from 'vitest';
import { firstOfMonth, fundFetchPlan, monthStartShifted, monthsBetween } from './fund-history-months';

describe('meses do informe de um fundo', () => {
    it('lista os meses do informe de uma data a outra, passando pela virada do ano', () => {
        expect(monthsBetween('2025-11-20', '2026-02-03')).toEqual(['202511', '202512', '202601', '202602']);
        expect(monthsBetween('2026-03-01', '2026-03-31')).toEqual(['202603']);
        expect(monthsBetween('2026-04-01', '2026-03-31')).toEqual([]);
    });

    it('acha o primeiro dia do mês e o primeiro dia de um mês deslocado', () => {
        expect(firstOfMonth('2026-03-20')).toBe('2026-03-01');
        expect(monthStartShifted('2026-03-31', -38)).toBe('2023-01-01');
        expect(monthStartShifted('2026-01-15', -1)).toBe('2025-12-01');
    });
});

describe('o que baixar de um fundo', () => {
    it('sem nada guardado baixa todos os meses pedidos', () => {
        expect(fundFetchPlan(null, '2026-01-10', '2026-03-05')).toEqual({ older: [], newer: ['202601', '202602', '202603'] });
    });

    it('com tudo guardado até hoje não baixa nada', () => {
        const coverage = { coveredFrom: '2026-01-01', coveredTo: '2026-03-05' };

        expect(fundFetchPlan(coverage, '2026-01-10', '2026-03-05')).toEqual({ older: [], newer: [] });
    });

    it('no dia seguinte baixa de novo só o mês do último dia guardado em diante', () => {
        const coverage = { coveredFrom: '2026-01-01', coveredTo: '2026-02-27' };

        expect(fundFetchPlan(coverage, '2026-01-10', '2026-03-02')).toEqual({ older: [], newer: ['202602', '202603'] });
    });

    it('quando pedem uma janela mais longa baixa só os meses anteriores ao que já tem', () => {
        const coverage = { coveredFrom: '2026-01-01', coveredTo: '2026-03-05' };

        expect(fundFetchPlan(coverage, '2025-10-20', '2026-03-05')).toEqual({ older: ['202510', '202511', '202512'], newer: [] });
    });
});
