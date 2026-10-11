import { describe, expect, it } from 'vitest';
import { averageWindow, categoryAverage } from './category-average';

describe('averageWindow', () => {
    it('usa os 3 meses civis anteriores que têm dados', () => {
        expect(averageWindow('2026-09', ['2026-06', '2026-07', '2026-08', '2026-09'])).toEqual(['2026-08', '2026-07', '2026-06']);
    });

    it('ignora o mês mostrado, meses sem dados e meses fora da janela', () => {
        expect(averageWindow('2026-09', ['2026-05', '2026-07', '2026-09'])).toEqual(['2026-07']);
    });

    it('é vazia sem mês anterior com dados', () => {
        expect(averageWindow('2026-09', ['2026-09'])).toEqual([]);
    });
});

describe('categoryAverage com as médias do protótipo', () => {
    it.each([
        ['Moradia', 770000, 770000, 0],
        ['Educação', 320000, 320000, 0],
        ['Saúde', 140000, 138000, 145],
        ['Mercado', 290000, 265000, 943],
        ['Delivery e restaurantes', 245000, 175000, 4000],
        ['Transporte', 130000, 120000, 833],
        ['Lazer', 190000, 140000, 3571],
        ['Assinaturas', 64000, 61000, 492],
        ['Compras', 235000, 160000, 4688]
    ])('%s', (_name: string, spent: number, average: number, delta: number) => {
        expect(categoryAverage(spent, [average, average, average])).toEqual({ averageMinor: average, deltaBps: delta, isNew: false });
    });

    it('com 1 mês de dados a média é desse mês', () => {
        expect(categoryAverage(30000, [20000])).toEqual({ averageMinor: 20000, deltaBps: 5000, isNew: false });
    });

    it('sem mês anterior a média e a variação são nulas', () => {
        expect(categoryAverage(30000, [])).toEqual({ averageMinor: null, deltaBps: null, isNew: false });
    });

    it('média zero com gasto marca a categoria como nova', () => {
        expect(categoryAverage(30000, [0, 0, 0])).toEqual({ averageMinor: 0, deltaBps: null, isNew: true });
    });

    it('média zero sem gasto não é nova', () => {
        expect(categoryAverage(0, [0])).toEqual({ averageMinor: 0, deltaBps: null, isNew: false });
    });

    it('arredonda a média e a variação para cima na metade', () => {
        expect(categoryAverage(100, [1, 2]).averageMinor).toBe(2);
        expect(categoryAverage(105, [100]).deltaBps).toBe(500);
        expect(categoryAverage(1, [3]).deltaBps).toBe(-6667);
        expect(categoryAverage(7, [200, 201, 201]).averageMinor).toBe(201);
    });

    it('média negativa (só estornos) não tem variação nem é nova', () => {
        expect(categoryAverage(5000, [-1000])).toEqual({ averageMinor: -1000, deltaBps: null, isNew: false });
    });
});
