import { describe, expect, it } from 'vitest';
import { makeScheduleTitle } from '../../../../../test/support/schedule-fixtures';
import type { MaturityItem } from '../../../fixed-income-schedule/services/maturities-reader.service';
import { maturitiesContextSchema } from '../../validation/ai-payload.schemas';
import { buildMaturitiesContext } from './maturities.context';

function item(overrides: Partial<MaturityItem>): MaturityItem {
    return {
        holdingKind: 'fixed_income',
        id: '0199f3a0-1111-7222-8333-444455556666',
        name: makeScheduleTitle({ name: 'CDB da Maria 11987654321' }).name,
        issuerName: 'Banco Exemplo',
        kind: 'cdb',
        maturityDate: '2026-12-10',
        daysToMaturity: 30,
        soon: true,
        estimatedValueMinor: 1_000_000,
        currency: 'BRL',
        reallocateMinor: 1_000_000,
        estimated: false,
        basis: 'contract',
        taxRegime: 'regressive',
        isSample: false,
        ...overrides
    };
}

describe('contexto de vencimentos', () => {
    it('agrupa por tipo e mês, soma os valores e não leva nome, id nem emissor', () => {
        const built = buildMaturitiesContext(
            [
                item({}),
                item({ maturityDate: '2026-12-20', estimatedValueMinor: 500_000 }),
                item({ maturityDate: '2027-02-01', estimatedValueMinor: 2_000_000 }),
                item({ holdingKind: 'position', kind: null, maturityDate: '2027-01-15', estimatedValueMinor: 300_000, estimated: true })
            ],
            '2027-03',
            'pt-BR'
        );

        const text: string = JSON.stringify(built.payload);
        ['Maria', '11987654321', '0199f3a0', 'Banco Exemplo'].forEach((value: string): void => {
            expect(text).not.toContain(value);
        });
        expect(maturitiesContextSchema.safeParse(built.payload).success).toBe(true);
        expect(built.payload.estimado).toBe(true);
        expect(built.payload.ate).toBe('2027-03');
        expect(built.payload.total).toBe('R$ 38.000');
        expect(built.payload.por_tipo).toEqual([
            {
                tipo: 'cdb',
                total: 'R$ 35.000',
                vencimentos: [
                    { mes: '2026-12', valor: 'R$ 15.000' },
                    { mes: '2027-02', valor: 'R$ 20.000' }
                ]
            },
            { tipo: 'tesouro', total: 'R$ 3.000', vencimentos: [{ mes: '2027-01', valor: 'R$ 3.000' }] }
        ]);
    });
});
