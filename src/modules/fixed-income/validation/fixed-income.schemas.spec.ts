import { describe, expect, it } from 'vitest';
import {
    createFixedIncomeTitleSchema,
    previewFixedIncomeSchema,
    titleIdParamsSchema,
    updateFixedIncomeTitleSchema
} from './fixed-income.schemas';

const VALID_TERMS = {
    kind: 'cdb',
    indexer: 'cdi_percent',
    rateBps: 11000,
    appliedMinor: 100000,
    appliedAt: '2024-01-15',
    maturityDate: '2027-01-15'
};

const VALID_CREATE = { ...VALID_TERMS, name: 'CDB Banco X' };

describe('createFixedIncomeTitleSchema', () => {
    it('aceita um título válido e apara o nome', () => {
        const parsed = createFixedIncomeTitleSchema.safeParse({ ...VALID_CREATE, name: '  CDB Banco X  ' });

        expect(parsed.success).toBe(true);
        expect(parsed.data?.name).toBe('CDB Banco X');
    });

    it('rejeita nome vazio depois de aparar, acima de 80 caracteres e com caractere de controle', () => {
        for (const name of ['   ', 'a'.repeat(81), 'CDB\u0000X', 'CDB\nX']) {
            expect(createFixedIncomeTitleSchema.safeParse({ ...VALID_CREATE, name }).success).toBe(false);
        }
    });

    it('aceita nome com exatamente 80 caracteres', () => {
        expect(createFixedIncomeTitleSchema.safeParse({ ...VALID_CREATE, name: 'a'.repeat(80) }).success).toBe(true);
    });

    it('rejeita taxa fora da faixa do indexador apontando o campo rateBps', () => {
        const cases: Array<[string, number]> = [
            ['cdi_percent', 0],
            ['cdi_percent', 30001],
            ['prefixed', 10001],
            ['ipca_plus', 5001],
            ['prefixed', -1]
        ];

        for (const [indexer, rateBps] of cases) {
            const parsed = createFixedIncomeTitleSchema.safeParse({ ...VALID_CREATE, indexer, rateBps });

            expect(parsed.success).toBe(false);
        }
        const issue = createFixedIncomeTitleSchema.safeParse({ ...VALID_CREATE, rateBps: 30001 }).error?.issues[0];
        expect(issue?.path).toEqual(['rateBps']);
    });

    it('aceita as bordas das faixas de cada indexador', () => {
        const cases: Array<[string, number]> = [
            ['cdi_percent', 1],
            ['cdi_percent', 30000],
            ['prefixed', 0],
            ['prefixed', 10000],
            ['ipca_plus', 0],
            ['ipca_plus', 5000]
        ];

        for (const [indexer, rateBps] of cases) {
            expect(createFixedIncomeTitleSchema.safeParse({ ...VALID_CREATE, indexer, rateBps }).success).toBe(true);
        }
    });

    it('rejeita taxa fracionária', () => {
        expect(createFixedIncomeTitleSchema.safeParse({ ...VALID_CREATE, rateBps: 110.5 }).success).toBe(false);
    });

    it('rejeita valor aplicado zero, negativo, fracionário ou acima do inteiro seguro', () => {
        for (const appliedMinor of [0, -1, 10.5, Number.MAX_SAFE_INTEGER + 1]) {
            expect(createFixedIncomeTitleSchema.safeParse({ ...VALID_CREATE, appliedMinor }).success).toBe(false);
        }
    });

    it('rejeita datas fora do formato ou que não existem no calendário', () => {
        for (const appliedAt of ['2024-02-30', '2024-13-01', '15/01/2024', '2024-1-5', '2023-02-29']) {
            expect(createFixedIncomeTitleSchema.safeParse({ ...VALID_CREATE, appliedAt }).success).toBe(false);
        }
    });

    it('aceita 29 de fevereiro de ano bissexto', () => {
        expect(createFixedIncomeTitleSchema.safeParse({ ...VALID_CREATE, appliedAt: '2024-02-29' }).success).toBe(true);
    });

    it('rejeita campo desconhecido', () => {
        expect(createFixedIncomeTitleSchema.safeParse({ ...VALID_CREATE, extra: true }).success).toBe(false);
    });

    it('rejeita tipo, indexador e moeda fora do enum e classId que não é uuid', () => {
        expect(createFixedIncomeTitleSchema.safeParse({ ...VALID_CREATE, kind: 'poupanca' }).success).toBe(false);
        expect(createFixedIncomeTitleSchema.safeParse({ ...VALID_CREATE, indexer: 'selic' }).success).toBe(false);
        expect(createFixedIncomeTitleSchema.safeParse({ ...VALID_CREATE, currency: 'EUR' }).success).toBe(false);
        expect(createFixedIncomeTitleSchema.safeParse({ ...VALID_CREATE, classId: 'abc' }).success).toBe(false);
    });

    it('aceita moeda e classId opcionais', () => {
        const parsed = createFixedIncomeTitleSchema.safeParse({
            ...VALID_CREATE,
            currency: 'BRL',
            classId: '00000000-0000-4000-8000-00000000000a'
        });

        expect(parsed.success).toBe(true);
    });
});

describe('updateFixedIncomeTitleSchema', () => {
    it('aceita atualização parcial e vazia', () => {
        expect(updateFixedIncomeTitleSchema.safeParse({}).success).toBe(true);
        expect(updateFixedIncomeTitleSchema.safeParse({ rateBps: 12000 }).success).toBe(true);
    });

    it('rejeita campo desconhecido e nome inválido', () => {
        expect(updateFixedIncomeTitleSchema.safeParse({ classId: '00000000-0000-4000-8000-00000000000a' }).success).toBe(false);
        expect(updateFixedIncomeTitleSchema.safeParse({ name: '' }).success).toBe(false);
    });
});

describe('previewFixedIncomeSchema', () => {
    it('aceita termos válidos sem nome', () => {
        expect(previewFixedIncomeSchema.safeParse(VALID_TERMS).success).toBe(true);
    });

    it('rejeita taxa fora da faixa e nome (campo desconhecido)', () => {
        expect(previewFixedIncomeSchema.safeParse({ ...VALID_TERMS, indexer: 'ipca_plus', rateBps: 6000 }).success).toBe(false);
        expect(previewFixedIncomeSchema.safeParse({ ...VALID_TERMS, name: 'x' }).success).toBe(false);
    });
});

describe('titleIdParamsSchema', () => {
    it('exige uuid', () => {
        expect(titleIdParamsSchema.safeParse({ id: '123' }).success).toBe(false);
        expect(titleIdParamsSchema.safeParse({ id: '00000000-0000-4000-8000-00000000000a' }).success).toBe(true);
    });
});
