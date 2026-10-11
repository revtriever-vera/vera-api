import { describe, expect, it } from 'vitest';
import { makeTitle } from '../../../../test/support/fixed-income-fixtures';
import { toFixedIncomeTitle, toFixedIncomeTitleView } from './fixed-income-title.mapper';
import { FixedIncomeTitleRow } from './fixed-income.types';

describe('fixed income title mapper', () => {
    it('lê bigint como número e date como AAAA-MM-DD sem deslocar o dia', () => {
        const row: FixedIncomeTitleRow = {
            id: 'a',
            companyId: 'c',
            kind: 'lci',
            name: 'LCI',
            indexer: 'prefixed',
            rateBps: 1150,
            currency: 'BRL',
            appliedMinor: '1234567',
            appliedAt: new Date(2025, 2, 9),
            maturityDate: new Date(2027, 11, 31),
            taxRegime: 'exempt',
            createdAt: new Date('2025-03-09T10:00:00Z'),
            updatedAt: new Date('2025-03-09T10:00:00Z'),
            deletedAt: null
        };

        expect(toFixedIncomeTitle(row)).toMatchObject({
            appliedMinor: 1234567,
            appliedAt: '2025-03-09',
            maturityDate: '2027-12-31',
            kind: 'lci',
            taxRegime: 'exempt'
        });
    });

    it('monta a view com a classe e a valorização', () => {
        const view = toFixedIncomeTitleView(makeTitle(), 'class-1', {
            asOf: '2025-02-01',
            valueMinor: 1,
            currency: 'BRL',
            accruedBps: 0,
            matured: false,
            estimated: false,
            status: 'ok',
            source: 'curve_cdi',
            taxRegime: 'regressive',
            taxEstimatedMinor: 0,
            netEstimatedMinor: 1
        });

        expect(view).toMatchObject({ id: 'title-1', classId: 'class-1', createdAt: '2025-01-06T12:00:00.000Z' });
        expect(view.valuation.valueMinor).toBe(1);
    });
});
