import { describe, expect, it } from 'vitest';
import { listQuerySchema, recategorizeSchema, renameAccountSchema } from './transactions.schemas';

describe('listQuerySchema', () => {
    it('aplica os padrões e converte página e tamanho', () => {
        expect(listQuerySchema.parse({})).toEqual({ page: 1, pageSize: 50 });
        expect(listQuerySchema.parse({ page: '3', pageSize: '200' })).toMatchObject({ page: 3, pageSize: 200 });
    });

    it.each([
        ['pageSize 201', { pageSize: '201' }],
        ['pageSize 0', { pageSize: '0' }],
        ['page 0', { page: '0' }],
        ['mês 13', { month: '2026-13' }],
        ['mês com from e to', { month: '2026-09', from: '2026-09-01', to: '2026-09-30' }],
        ['from sem to', { from: '2026-09-01' }],
        ['to sem from', { to: '2026-09-01' }],
        ['intervalo invertido', { from: '2026-09-30', to: '2026-09-01' }],
        ['intervalo acima de 400 dias', { from: '2025-01-01', to: '2026-12-31' }],
        ['data inexistente', { from: '2026-02-30', to: '2026-03-01' }],
        ['categoria com sem categoria', { categoryId: '0199c3a0-1111-7c52-9d0e-3f6a1b2c4d5e', uncategorized: 'true' }],
        ['busca de 1 caractere', { q: 'a' }],
        ['busca de 61 caracteres', { q: 'a'.repeat(61) }],
        ['sentido desconhecido', { direction: 'sideways' }],
        ['conta que não é uuid', { accountId: 'x' }]
    ])('recusa %s', (_label: string, query: Record<string, string>) => {
        expect(listQuerySchema.safeParse(query).success).toBe(false);
    });

    it('aceita 400 dias exatos, categoria com uncategorized=false e busca de 2 a 60 caracteres', () => {
        expect(listQuerySchema.safeParse({ from: '2026-01-01', to: '2027-02-04' }).success).toBe(true);
        expect(listQuerySchema.safeParse({ from: '2026-01-01', to: '2027-02-05' }).success).toBe(false);
        expect(listQuerySchema.safeParse({ categoryId: '0199c3a0-1111-7c52-9d0e-3f6a1b2c4d5e', uncategorized: 'false' }).success).toBe(
            true
        );
        expect(listQuerySchema.safeParse({ q: 'ab' }).success).toBe(true);
        expect(listQuerySchema.safeParse({ q: '  ab  ' }).success).toBe(true);
    });
});

describe('recategorizeSchema', () => {
    const id: string = '0199c3a0-1111-7c52-9d0e-3f6a1b2c4d5e';

    it('aceita categoria, categoria nula e regra com categoria', () => {
        expect(recategorizeSchema.safeParse({ categoryId: id }).success).toBe(true);
        expect(recategorizeSchema.safeParse({ categoryId: null }).success).toBe(true);
        expect(recategorizeSchema.safeParse({ categoryId: id, rule: { scope: 'counterparty' } }).success).toBe(true);
        expect(recategorizeSchema.safeParse({ categoryId: null, rule: null }).success).toBe(true);
    });

    it('recusa regra sem categoria, escopo desconhecido e campos extras', () => {
        expect(recategorizeSchema.safeParse({ categoryId: null, rule: { scope: 'description' } }).success).toBe(false);
        expect(recategorizeSchema.safeParse({ categoryId: id, rule: { scope: 'contains' } }).success).toBe(false);
        expect(recategorizeSchema.safeParse({ categoryId: id, amountMinor: 1 }).success).toBe(false);
        expect(recategorizeSchema.safeParse({}).success).toBe(false);
    });
});

describe('renameAccountSchema', () => {
    it('apara o nome e recusa vazio, longo e com caracteres de controle', () => {
        expect(renameAccountSchema.parse({ name: '  Itaú  ' })).toEqual({ name: 'Itaú' });
        expect(renameAccountSchema.safeParse({ name: '   ' }).success).toBe(false);
        expect(renameAccountSchema.safeParse({ name: 'a'.repeat(61) }).success).toBe(false);
        expect(renameAccountSchema.safeParse({ name: 'a\u0000b' }).success).toBe(false);
    });
});
