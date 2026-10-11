import { describe, expect, it } from 'vitest';
import { transactionsExportQuerySchema } from './transactions-export.schemas';

const ID: string = '0199c3a0-7b1e-7c52-9d0e-3f6a1b2c4d5e';

describe('transactionsExportQuerySchema', () => {
    it('accepts a format alone and a month', () => {
        expect(transactionsExportQuerySchema.safeParse({ format: 'csv' }).success).toBe(true);
        expect(transactionsExportQuerySchema.safeParse({ format: 'xlsx', month: '2026-09' }).success).toBe(true);
    });

    it('rejects an invalid or missing format', () => {
        expect(transactionsExportQuerySchema.safeParse({ format: 'pdf' }).success).toBe(false);
        expect(transactionsExportQuerySchema.safeParse({}).success).toBe(false);
    });

    it('rejects month with a range, a half range, an unordered range and more than 400 days', () => {
        const base = { format: 'csv' };
        expect(transactionsExportQuerySchema.safeParse({ ...base, month: '2026-09', from: '2026-09-01', to: '2026-09-02' }).success).toBe(
            false
        );
        expect(transactionsExportQuerySchema.safeParse({ ...base, from: '2026-09-01' }).success).toBe(false);
        expect(transactionsExportQuerySchema.safeParse({ ...base, from: '2026-09-10', to: '2026-09-01' }).success).toBe(false);
        expect(transactionsExportQuerySchema.safeParse({ ...base, from: '2025-01-01', to: '2026-09-01' }).success).toBe(false);
        expect(transactionsExportQuerySchema.safeParse({ ...base, from: '2025-08-03', to: '2026-09-06' }).success).toBe(true);
        expect(transactionsExportQuerySchema.safeParse({ ...base, from: '2025-08-02', to: '2026-09-06' }).success).toBe(false);
    });

    it('rejects categoryId with uncategorized=true and invalid ids or search', () => {
        const base = { format: 'csv' };
        expect(transactionsExportQuerySchema.safeParse({ ...base, categoryId: ID, uncategorized: 'true' }).success).toBe(false);
        expect(transactionsExportQuerySchema.safeParse({ ...base, categoryId: ID, uncategorized: 'false' }).success).toBe(true);
        expect(transactionsExportQuerySchema.safeParse({ ...base, accountId: 'x' }).success).toBe(false);
        expect(transactionsExportQuerySchema.safeParse({ ...base, q: 'a' }).success).toBe(false);
        expect(transactionsExportQuerySchema.safeParse({ ...base, direction: 'out', q: 'pix' }).success).toBe(true);
    });
});
