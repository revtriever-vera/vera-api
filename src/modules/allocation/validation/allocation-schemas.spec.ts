import { describe, expect, it } from 'vitest';
import { updatePortfolioSettingsSchema } from './allocation-settings.schemas';
import { assetTargetsBodySchema, classTargetsBodySchema } from './allocation-targets.schemas';

const ID_A = '00000000-0000-4000-8000-00000000000a';
const ID_B = '00000000-0000-4000-8000-00000000000b';

describe('classTargetsBodySchema', () => {
    it('rejeita classId repetido', () => {
        const parsed = classTargetsBodySchema.safeParse({
            targets: [
                { classId: ID_A, targetBps: 5000 },
                { classId: ID_A, targetBps: 5000 }
            ]
        });

        expect(parsed.success).toBe(false);
    });

    it('rejeita targetBps fora de 0 a 10000 e não inteiro', () => {
        for (const targetBps of [-1, 10001, 10.5]) {
            expect(classTargetsBodySchema.safeParse({ targets: [{ classId: ID_A, targetBps }] }).success).toBe(false);
        }
    });

    it('aceita os limites', () => {
        const parsed = classTargetsBodySchema.safeParse({
            targets: [
                { classId: ID_A, targetBps: 0 },
                { classId: ID_B, targetBps: 10000 }
            ]
        });

        expect(parsed.success).toBe(true);
    });
});

describe('assetTargetsBodySchema', () => {
    it('rejeita tipo de ativo desconhecido', () => {
        expect(
            assetTargetsBodySchema.safeParse({ targets: [{ subjectType: 'stock', subjectId: ID_A, targetInClassBps: 0 }] }).success
        ).toBe(false);
    });
});

describe('updatePortfolioSettingsSchema', () => {
    it('tolerância vai de 0 a 2000 e a moeda só BRL ou USD', () => {
        expect(updatePortfolioSettingsSchema.safeParse({ toleranceBps: 2000 }).success).toBe(true);
        expect(updatePortfolioSettingsSchema.safeParse({ toleranceBps: 0 }).success).toBe(true);
        expect(updatePortfolioSettingsSchema.safeParse({ toleranceBps: 2001 }).success).toBe(false);
        expect(updatePortfolioSettingsSchema.safeParse({ toleranceBps: -1 }).success).toBe(false);
        expect(updatePortfolioSettingsSchema.safeParse({ baseCurrency: 'EUR' }).success).toBe(false);
        expect(updatePortfolioSettingsSchema.safeParse({ baseCurrency: 'USD' }).success).toBe(true);
        expect(updatePortfolioSettingsSchema.safeParse({}).success).toBe(true);
    });
});
