import { describe, expect, it } from 'vitest';
import { portfolioExportQuerySchema } from './portfolio-export.schemas';

describe('portfolioExportQuerySchema', () => {
    it('aceita xlsx e csv e rejeita outros formatos ou ausência', () => {
        expect(portfolioExportQuerySchema.safeParse({ format: 'xlsx' }).success).toBe(true);
        expect(portfolioExportQuerySchema.safeParse({ format: 'csv' }).success).toBe(true);
        expect(portfolioExportQuerySchema.safeParse({ format: 'pdf' }).success).toBe(false);
        expect(portfolioExportQuerySchema.safeParse({}).success).toBe(false);
    });
});
