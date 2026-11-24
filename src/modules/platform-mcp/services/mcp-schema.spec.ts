import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { inputSchemaOf } from './mcp-schema';

describe('inputSchemaOf', () => {
    it('vira JSON Schema: nullable do OpenAPI passa a tipo com null, em qualquer nível', () => {
        const schema = z.object({
            maxUses: z.number().int().nullable().default(null).describe('limite'),
            trial: z.object({ days: z.number().int().nullable() }),
            kind: z.enum(['none', 'card'])
        });

        const result: Record<string, unknown> = inputSchemaOf(schema);

        expect(result).toMatchObject({
            type: 'object',
            properties: {
                maxUses: { type: ['integer', 'null'], description: 'limite', default: null },
                trial: { properties: { days: { type: ['integer', 'null'] } } },
                kind: { type: 'string', enum: ['none', 'card'] }
            }
        });
        expect(JSON.stringify(result)).not.toContain('nullable');
    });

    it('um schema vazio vira um objeto sem propriedades', () => {
        expect(inputSchemaOf(z.object({}))).toMatchObject({ type: 'object' });
    });
});
