import { describe, expect, it } from 'vitest';
import {
    averagePriceSchema,
    createPositionSchema,
    positionIdParamsSchema,
    quantitySchema,
    updatePositionSchema
} from './positions.schemas';

describe('quantitySchema', () => {
    it('aceita zero, inteiro e decimal até 10 casas', () => {
        for (const value of ['0', '10', '0.5', '123.1234567890', '9'.repeat(18)]) {
            expect(quantitySchema.safeParse(value).success).toBe(true);
        }
    });

    it('rejeita sinal, expoente, vírgula, vazio, mais de 18 inteiros e mais de 10 decimais', () => {
        for (const value of ['-1', '+1', '1e5', '1,5', '', ' 1', '1.', '.5', '9'.repeat(19), '1.12345678901']) {
            expect(quantitySchema.safeParse(value).success).toBe(false);
        }
    });

    it('rejeita número em vez de texto', () => {
        expect(quantitySchema.safeParse(10).success).toBe(false);
    });
});

describe('averagePriceSchema', () => {
    it('aceita nulo e decimal até 8 casas', () => {
        expect(averagePriceSchema.safeParse(null).success).toBe(true);
        expect(averagePriceSchema.safeParse('12.12345678').success).toBe(true);
    });

    it('rejeita mais de 8 decimais, mais de 16 inteiros e negativo', () => {
        for (const value of ['1.123456789', '9'.repeat(17), '-1']) {
            expect(averagePriceSchema.safeParse(value).success).toBe(false);
        }
    });
});

describe('createPositionSchema', () => {
    const ASSET_ID = '00000000-0000-4000-8000-00000000000a';

    it('exige ativo e quantidade e aceita preço médio nulo ou ausente', () => {
        expect(createPositionSchema.safeParse({}).success).toBe(false);
        expect(createPositionSchema.safeParse({ assetId: ASSET_ID }).success).toBe(false);
        expect(createPositionSchema.safeParse({ assetId: ASSET_ID, quantity: '1' }).success).toBe(true);
        expect(createPositionSchema.safeParse({ assetId: ASSET_ID, quantity: '1', averagePrice: null }).success).toBe(true);
    });

    it('rejeita classId e assetId que não são uuid e campo desconhecido', () => {
        expect(createPositionSchema.safeParse({ assetId: ASSET_ID, quantity: '1', classId: 'x' }).success).toBe(false);
        expect(createPositionSchema.safeParse({ assetId: 'x', quantity: '1' }).success).toBe(false);
        expect(createPositionSchema.safeParse({ assetId: ASSET_ID, quantity: '1', extra: 1 }).success).toBe(false);
    });
});

describe('updatePositionSchema', () => {
    it('aceita parcial e rejeita classId, que não se altera aqui', () => {
        expect(updatePositionSchema.safeParse({}).success).toBe(true);
        expect(updatePositionSchema.safeParse({ averagePrice: '3.5' }).success).toBe(true);
        expect(updatePositionSchema.safeParse({ classId: '00000000-0000-4000-8000-00000000000a' }).success).toBe(false);
    });
});

describe('positionIdParamsSchema', () => {
    it('exige uuid', () => {
        expect(positionIdParamsSchema.safeParse({ id: 'abc' }).success).toBe(false);
    });
});
