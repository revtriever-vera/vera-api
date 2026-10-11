import { describe, expect, it } from 'vitest';
import { commitBodySchema, csvMappingSchema, multipartBodyOf, previewBodySchema } from './statement-import.schemas';

const MAPPING = {
    hasHeader: true,
    dateColumn: 0,
    descriptionColumn: 1,
    amountColumn: 2,
    dateFormat: 'dd/MM/yyyy',
    decimalSeparator: ',',
    invertSign: false
};

describe('csvMappingSchema', () => {
    it('aceita valor único ou o par débito e crédito, nunca os dois nem nenhum', () => {
        const pair = { ...MAPPING, amountColumn: undefined, debitColumn: 3, creditColumn: 4 };

        expect(csvMappingSchema.safeParse(MAPPING).success).toBe(true);
        expect(csvMappingSchema.safeParse(pair).success).toBe(true);
        expect(csvMappingSchema.safeParse({ ...MAPPING, debitColumn: 3, creditColumn: 4 }).success).toBe(false);
        expect(csvMappingSchema.safeParse({ ...MAPPING, amountColumn: undefined }).success).toBe(false);
        expect(csvMappingSchema.safeParse({ ...MAPPING, debitColumn: 3 }).success).toBe(false);
    });

    it('recusa campo desconhecido, índice negativo e formato fora da lista', () => {
        expect(csvMappingSchema.safeParse({ ...MAPPING, extra: 1 }).success).toBe(false);
        expect(csvMappingSchema.safeParse({ ...MAPPING, dateColumn: -1 }).success).toBe(false);
        expect(csvMappingSchema.safeParse({ ...MAPPING, dateFormat: 'yyyy/MM/dd' }).success).toBe(false);
    });
});

describe('previewBodySchema', () => {
    it('converte o mapping de texto JSON e recusa o que não é JSON', () => {
        const parsed = previewBodySchema.safeParse({ mapping: JSON.stringify(MAPPING) });

        expect(parsed.success && parsed.data.mapping?.dateColumn).toBe(0);
        expect(previewBodySchema.safeParse({ mapping: 'não é json' }).success).toBe(false);
        expect(previewBodySchema.safeParse({ mapping: '"texto"' }).success).toBe(false);
        expect(previewBodySchema.safeParse({}).success).toBe(true);
    });
});

describe('commitBodySchema', () => {
    const ID = '0199c3a0-2222-7c52-9d0e-3f6a1b2c4d5e';

    it('aceita conta existente ou conta nova', () => {
        expect(commitBodySchema.safeParse({ format: 'ofx', accountId: ID }).success).toBe(true);
        expect(commitBodySchema.safeParse({ format: 'ofx', newAccountName: 'N', newAccountKind: 'checking' }).success).toBe(true);
    });

    it('recusa as duas formas, nenhuma e a conta nova incompleta', () => {
        expect(commitBodySchema.safeParse({ format: 'ofx', accountId: ID, newAccountName: 'N', newAccountKind: 'checking' }).success).toBe(
            false
        );
        expect(commitBodySchema.safeParse({ format: 'ofx' }).success).toBe(false);
        expect(commitBodySchema.safeParse({ format: 'ofx', newAccountKind: 'checking' }).success).toBe(false);
    });
});

describe('multipartBodyOf', () => {
    it('acrescenta o campo file binário e o torna obrigatório', () => {
        const body = multipartBodyOf(previewBodySchema) as { properties: Record<string, { format?: string }>; required: string[] };

        expect(body.properties['file']?.format).toBe('binary');
        expect(body.required).toContain('file');
        expect(Object.keys(body.properties)).toEqual(expect.arrayContaining(['format', 'mapping']));
    });
});
