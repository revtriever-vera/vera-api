import { describe, expect, it } from 'vitest';
import { MAX_CONTRIBUTION_MINOR } from '../domain/contribution.types';
import { suggestRequestSchema } from './contribution.schemas';

describe('suggestRequestSchema', () => {
    it('aceita os limites do aporte', () => {
        expect(suggestRequestSchema.safeParse({ amountMinor: 1 }).success).toBe(true);
        expect(suggestRequestSchema.safeParse({ amountMinor: MAX_CONTRIBUTION_MINOR }).success).toBe(true);
    });

    it('rejeita zero, negativo, fracionário e acima do teto', () => {
        for (const amountMinor of [0, -100, 10.5, MAX_CONTRIBUTION_MINOR + 1]) {
            expect(suggestRequestSchema.safeParse({ amountMinor }).success).toBe(false);
        }
    });

    it('rejeita valor ausente ou em texto', () => {
        expect(suggestRequestSchema.safeParse({}).success).toBe(false);
        expect(suggestRequestSchema.safeParse({ amountMinor: '100' }).success).toBe(false);
    });
});
