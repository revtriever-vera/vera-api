import { describe, expect, it, vi } from 'vitest';
import { makeTitle } from '../../../../test/support/fixed-income-fixtures';
import { FixedIncomeTitleDomain } from '../domain/fixed-income-title.domain';
import { FixedIncomeAccountExporter } from './fixed-income-account.exporter';

describe('FixedIncomeAccountExporter', () => {
    it('exporta só os títulos reais, na seção fixed_income, sem campos internos', async () => {
        const listReal = vi.fn().mockResolvedValue([makeTitle({ id: 'a' })]);
        const exporter = new FixedIncomeAccountExporter({ listReal } as unknown as FixedIncomeTitleDomain);

        const exported = await exporter.exportAll();

        expect(exporter.area).toBe('fixed_income');
        expect(exported.titles).toEqual([
            {
                id: 'a',
                kind: 'cdb',
                name: 'CDB Banco Exemplo',
                indexer: 'cdi_percent',
                rateBps: 11000,
                currency: 'BRL',
                appliedMinor: 10_000_000,
                appliedAt: '2025-01-06',
                maturityDate: '2030-01-06',
                taxRegime: 'regressive',
                createdAt: '2025-01-06T12:00:00.000Z'
            }
        ]);
    });
});
