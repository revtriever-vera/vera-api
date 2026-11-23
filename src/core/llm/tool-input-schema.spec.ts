import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toolInputSchemaOf } from './tool-input-schema';

describe('toolInputSchemaOf', () => {
    it('exige só o que o zod exige e escreve null no tipo', () => {
        const schema: z.ZodTypeAny = z.object({
            period: z.string(),
            note: z.string().nullable(),
            limit: z.number().int().optional(),
            kind: z.enum(['a', 'b']).nullable().optional()
        });

        const json = toolInputSchemaOf(schema);

        expect(json['required']).toEqual(['period', 'note']);
        expect((json['properties'] as Record<string, unknown>)['note']).toEqual({ type: ['string', 'null'] });
        expect((json['properties'] as Record<string, { type: unknown; enum: unknown }>)['kind']).toMatchObject({
            type: ['string', 'null'],
            enum: ['a', 'b', null]
        });
    });

    it('trata efeitos, listas e objetos aninhados', () => {
        const schema: z.ZodTypeAny = z.object({
            rows: z.array(z.object({ id: z.string(), tag: z.string().optional() })),
            when: z
                .string()
                .refine((value: string): boolean => value.length > 0)
                .optional()
        });

        const json = toolInputSchemaOf(schema);
        const rows = (json['properties'] as Record<string, { items: { required: string[] } }>)['rows'];

        expect(json['required']).toEqual(['rows']);
        expect(rows?.items.required).toEqual(['id']);
    });

    it('sem campo obrigatório não declara required, e tira as chaves só do OpenAPI', () => {
        const json = toolInputSchemaOf(z.object({ n: z.number().gt(1).optional() }));

        expect(json['required']).toBeUndefined();
        expect(JSON.stringify(json)).not.toContain('nullable');
        expect(JSON.stringify(json)).not.toContain('exclusiveMinimum":true');
    });

    it('um nullable sem tipo simples vira anyOf com null', () => {
        const json = toolInputSchemaOf(z.object({ v: z.union([z.string(), z.number()]).nullable() }));

        expect(JSON.stringify((json['properties'] as Record<string, unknown>)['v'])).toContain('"null"');
    });
});
