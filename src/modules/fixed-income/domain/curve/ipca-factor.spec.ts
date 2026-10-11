import { describe, expect, it } from 'vitest';
import { buildIpcaSeries, ipcaFactor, nextMonthStart, previousMonthKey } from './ipca-factor';

describe('ipca factor', () => {
    it('navega entre meses, inclusive na virada do ano', () => {
        expect(nextMonthStart('2025-12-15')).toBe('2026-01-01');
        expect(previousMonthKey('2025-01')).toBe('2024-12');
        expect(previousMonthKey('2025-03')).toBe('2025-02');
    });

    it('janela vazia não aplica inflação', () => {
        const result = ipcaFactor(buildIpcaSeries([]), '2025-03-10', '2025-03-10');

        expect(result?.factor.toString()).toBe('1');
        expect(result?.estimated).toBe(false);
    });

    it('um mês inteiro aplica o IPCA do mês anterior', () => {
        const result = ipcaFactor(buildIpcaSeries([{ date: '2025-02-01', value: '0.50' }]), '2025-03-01', '2025-04-01');

        expect(result?.factor.toFixed(10)).toBe('1.0050000000');
        expect(result?.estimated).toBe(false);
    });

    it('furo no meio da série usa o ponto anterior e marca estimado', () => {
        const series = buildIpcaSeries([
            { date: '2025-01-01', value: '0.30' },
            { date: '2025-03-01', value: '0.40' }
        ]);

        const result = ipcaFactor(series, '2025-03-01', '2025-04-01');

        expect(result?.factor.toFixed(10)).toBe('1.0030000000');
        expect(result?.estimated).toBe(true);
    });

    it('IPCA negativo (deflação) reduz o fator', () => {
        const result = ipcaFactor(buildIpcaSeries([{ date: '2025-02-01', value: '-0.32' }]), '2025-03-01', '2025-04-01');

        expect(result?.factor.toFixed(10)).toBe('0.9968000000');
    });

    it('janela antes do primeiro IPCA não é coberta', () => {
        expect(ipcaFactor(buildIpcaSeries([{ date: '2025-02-01', value: '0.50' }]), '2025-01-10', '2025-01-20')).toBeNull();
    });
});
