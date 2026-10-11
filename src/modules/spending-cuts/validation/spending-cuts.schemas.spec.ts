import { describe, expect, it } from 'vitest';
import { cutsQuerySchema } from './spending-cuts.schemas';

describe('cutsQuerySchema', () => {
    it('aceita consulta vazia e converte goalBps de texto para inteiro', () => {
        expect(cutsQuerySchema.parse({})).toEqual({});
        expect(cutsQuerySchema.parse({ month: '2026-09', goalBps: '3500' })).toEqual({ month: '2026-09', goalBps: 3500 });
    });

    it('rejeita meta fora de 0 a 9000, fracionária ou não numérica', () => {
        for (const goalBps of ['9001', '-1', '10.5', 'abc']) {
            expect(cutsQuerySchema.safeParse({ goalBps }).success).toBe(false);
        }
        expect(cutsQuerySchema.safeParse({ goalBps: '0' }).success).toBe(true);
        expect(cutsQuerySchema.safeParse({ goalBps: '9000' }).success).toBe(true);
    });
});
