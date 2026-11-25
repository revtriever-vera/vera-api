import { describe, expect, it } from 'vitest';
import { DuplicateTitleError, FixedIncomeIncompleteError, InvalidEditError } from '../investment-import.errors';
import { StoredFixedIncome } from './fixed-income-import.types';
import { outcomesOf, planTitles } from './title-decisions';

function entry(overrides: Partial<StoredFixedIncome>): StoredFixedIncome {
    return {
        lineId: 'F1',
        product: 'CDB - CDB EXEMPLO 112% CDI',
        issuerName: 'BANCO EXEMPLO',
        issuerId: null,
        kind: 'cdb',
        indexer: 'cdi_percent',
        rateBps: 11200,
        appliedMinor: 1000000,
        appliedAt: '2024-03-15',
        maturityDate: '2028-03-15',
        status: 'inferred',
        reason: null,
        suggestion: '',
        ...overrides
    };
}

const NEEDS_INPUT: StoredFixedIncome = entry({ lineId: 'F2', status: 'needs_input', reason: 'missing_data', rateBps: null });

describe('planTitles', () => {
    it('confirma o título como foi proposto', () => {
        const planned = planTitles([entry({})], [{ lineId: 'F1', confirm: true }]);

        expect(planned).toEqual([
            {
                lineId: 'F1',
                draft: {
                    name: 'CDB - CDB EXEMPLO 112% CDI',
                    kind: 'cdb',
                    issuerId: null,
                    indexer: 'cdi_percent',
                    rateBps: 11200,
                    appliedMinor: 1000000,
                    appliedAt: '2024-03-15',
                    maturityDate: '2028-03-15'
                },
                forced: false
            }
        ]);
    });

    it('a correção vale sobre a proposta, inclusive o emissor', () => {
        const planned = planTitles([entry({})], [{ lineId: 'F1', edits: { rateBps: 11500, issuerId: 'banco-exemplo', name: 'Meu CDB' } }]);

        expect(planned[0]?.draft).toMatchObject({ rateBps: 11500, issuerId: 'banco-exemplo', name: 'Meu CDB', kind: 'cdb' });
    });

    it('completa o título que precisa de dados', () => {
        const planned = planTitles([NEEDS_INPUT], [{ lineId: 'F2', edits: { rateBps: 10800 } }]);

        expect(planned[0]?.draft.rateBps).toBe(10800);
    });

    it('recusa confirmar o título que precisa de dados sem os campos obrigatórios', () => {
        expect(() => planTitles([NEEDS_INPUT], [{ lineId: 'F2', confirm: true }])).toThrow(FixedIncomeIncompleteError);
        expect(() => planTitles([NEEDS_INPUT], [{ lineId: 'F2', edits: { name: 'x' } }])).toThrow(FixedIncomeIncompleteError);
        try {
            planTitles([NEEDS_INPUT], [{ lineId: 'F2', edits: { name: 'x' } }]);
        } catch (error) {
            expect((error as FixedIncomeIncompleteError).meta).toEqual({ lineId: 'F2', missing: ['rateBps'] });
        }
    });

    it('pular e não decidir não criam título; confirmar duplicado é recusado', () => {
        const duplicate: StoredFixedIncome = entry({ lineId: 'F3', status: 'duplicate', reason: 'duplicate' });

        expect(
            planTitles(
                [entry({}), NEEDS_INPUT, duplicate],
                [
                    { lineId: 'F1', skip: true },
                    { lineId: 'F3', skip: true }
                ]
            )
        ).toEqual([]);
        expect(() => planTitles([duplicate], [{ lineId: 'F3', confirm: true }])).toThrow(DuplicateTitleError);
    });

    it('a correção cria o duplicado de propósito', () => {
        const duplicate: StoredFixedIncome = entry({ lineId: 'F3', status: 'duplicate', reason: 'duplicate' });

        expect(planTitles([duplicate], [{ lineId: 'F3', edits: { rateBps: 11200 } }])).toHaveLength(1);
    });

    it('recusa linha desconhecida ou repetida', () => {
        expect(() => planTitles([entry({})], [{ lineId: 'F9', skip: true }])).toThrow(InvalidEditError);
        expect(() =>
            planTitles(
                [entry({})],
                [
                    { lineId: 'F1', skip: true },
                    { lineId: 'F1', confirm: true }
                ]
            )
        ).toThrow(InvalidEditError);
    });

    it('liga cada título criado à sua linha', () => {
        const planned = planTitles([entry({})], [{ lineId: 'F1', confirm: true }]);

        expect(outcomesOf(planned, ['title-1'])).toEqual([{ lineId: 'F1', titleId: 'title-1' }]);
    });
});
