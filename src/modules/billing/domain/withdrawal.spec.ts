import { describe, expect, it } from 'vitest';
import { isWithinWithdrawal, withdrawalEndsAt } from './withdrawal';

const PAID_AT: Date = new Date('2026-11-01T10:00:00Z');

describe('arrependimento', () => {
    it('vale até o fim do prazo contado do primeiro pagamento', () => {
        expect(isWithinWithdrawal(PAID_AT, 7, new Date('2026-11-08T10:00:00Z'))).toBe(true);
        expect(isWithinWithdrawal(PAID_AT, 7, new Date('2026-11-08T10:00:01Z'))).toBe(false);
        expect(withdrawalEndsAt(PAID_AT, 7)?.toISOString()).toBe('2026-11-08T10:00:00.000Z');
    });

    it('sem pagamento não há prazo', () => {
        expect(withdrawalEndsAt(null, 7)).toBeNull();
        expect(isWithinWithdrawal(null, 7, PAID_AT)).toBe(false);
    });
});
