import { describe, expect, it } from 'vitest';
import { resolveCutStatus } from './cut-status';

const BASE = { hasData: true, incomeMinor: 2_800_000, gapMinor: 224_000, flexibleTotalMinor: 1_154_000 };

describe('resolveCutStatus', () => {
    it('sem dados vence todos os outros', () => {
        expect(resolveCutStatus({ ...BASE, hasData: false, incomeMinor: 0 })).toBe('no_data');
    });

    it('renda zero é um status, não um erro', () => {
        expect(resolveCutStatus({ ...BASE, incomeMinor: 0 })).toBe('no_income');
    });

    it('gap zero é meta batida', () => {
        expect(resolveCutStatus({ ...BASE, gapMinor: 0 })).toBe('goal_met');
    });

    it('gap dentro do total flexível sugere corte, inclusive no limite', () => {
        expect(resolveCutStatus(BASE)).toBe('cut_suggested');
        expect(resolveCutStatus({ ...BASE, gapMinor: 1_154_000 })).toBe('cut_suggested');
    });

    it('gap acima do total flexível excede', () => {
        expect(resolveCutStatus({ ...BASE, gapMinor: 1_154_001 })).toBe('exceeds_flexible');
        expect(resolveCutStatus({ ...BASE, flexibleTotalMinor: 0 })).toBe('exceeds_flexible');
    });
});
