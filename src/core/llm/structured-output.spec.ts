import { describe, expect, it } from 'vitest';
import { conformToSchema, parseJsonObject, strictWireSchemaOf, unfencedOf } from './structured-output';

const SCHEMA: Record<string, unknown> = {
    type: 'object',
    required: ['title', 'items', 'note'],
    properties: {
        title: { type: 'string', maxLength: 5 },
        items: { type: 'array', maxItems: 2, items: { type: 'object', properties: { label: { type: 'string' } } } },
        note: { type: 'string', nullable: true }
    }
};

describe('structured-output', () => {
    it('tira a cerca de código, com ou sem json', () => {
        expect(unfencedOf('```json\n{"a":1}\n```')).toBe('{"a":1}');
        expect(unfencedOf('```\n{"a":1}\n```')).toBe('{"a":1}');
        expect(unfencedOf('  {"a":1} ')).toBe('{"a":1}');
        expect(unfencedOf('`````')).toBe('`````');
    });

    it('lê o objeto de dentro de texto ao redor e da cerca', () => {
        expect(parseJsonObject('claro: {"a":1} pronto')).toEqual({ a: 1 });
        expect(parseJsonObject('```json\n{"a":{"b":2}}\n```')).toEqual({ a: { b: 2 } });
    });

    it('devolve null para texto sem objeto, truncado ou inválido', () => {
        expect(parseJsonObject('sem chaves')).toBeNull();
        expect(parseJsonObject('{"a":1')).toBeNull();
        expect(parseJsonObject('{"a": }')).toBeNull();
    });

    it('ajusta ao schema: corta o excesso, completa o vazio e lê objeto escrito como texto', () => {
        const conformed: unknown = conformToSchema({ title: 'muito longo', items: '[{"label":"a"},{"label":"b"},{"label":"c"}]' }, SCHEMA);

        expect(conformed).toEqual({ title: 'muito', items: [{ label: 'a' }, { label: 'b' }], note: null });
    });

    it('mantém campo extra para o chamador recusar no safeParse', () => {
        expect(conformToSchema({ title: 'a', items: [], extra: 1 }, SCHEMA)).toEqual({ title: 'a', items: [], note: null, extra: 1 });
    });

    it('não mexe no que o schema não descreve', () => {
        expect(conformToSchema(5, SCHEMA)).toBe(5);
        expect(conformToSchema('texto', 'sem schema')).toBe('texto');
        expect(conformToSchema({ a: 1 }, { type: 'object' })).toEqual({ a: 1 });
        expect(conformToSchema('{não json', { type: 'object' })).toBe('{não json');
        expect(conformToSchema('3', { type: 'object' })).toBe('3');
    });

    it('o schema estrito fecha cada objeto, exige todas as chaves e deixa o opcional anulável', () => {
        const strict: unknown = strictWireSchemaOf({
            type: 'object',
            description: 'raiz',
            required: ['title'],
            properties: {
                title: { type: 'string', maxLength: 5 },
                kind: { type: 'string', enum: ['a', 'b'] },
                tags: { type: 'array', items: { type: 'object', required: ['k'], properties: { k: { type: 'string' } } } },
                inner: { type: 'object', properties: { x: { type: 'number', nullable: true } } },
                either: { type: ['string', 'null'] },
                mixed: { type: ['string', 'number'] }
            }
        });

        expect(strict).toEqual({
            type: 'object',
            description: 'raiz',
            required: ['title', 'kind', 'tags', 'inner', 'either', 'mixed'],
            additionalProperties: false,
            properties: {
                title: { type: 'string' },
                kind: { type: ['string', 'null'], enum: ['a', 'b', null] },
                tags: {
                    anyOf: [
                        {
                            type: 'array',
                            items: { type: 'object', required: ['k'], additionalProperties: false, properties: { k: { type: 'string' } } }
                        },
                        { type: 'null' }
                    ]
                },
                inner: {
                    anyOf: [
                        { type: 'object', required: ['x'], additionalProperties: false, properties: { x: { type: ['number', 'null'] } } },
                        { type: 'null' }
                    ]
                },
                either: { type: ['string', 'null'] },
                mixed: { anyOf: [{}, { type: 'null' }] }
            }
        });
        expect(strictWireSchemaOf('nao-objeto')).toEqual({});
    });
});
