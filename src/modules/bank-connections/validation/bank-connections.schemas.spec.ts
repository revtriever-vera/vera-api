import { describe, expect, it } from 'vitest';
import { connectItemsSchema, purgeQuerySchema, saveCredentialsSchema } from './bank-connections.schemas';
import { SecretSafeValidationPipe } from './secret-safe-validation.pipe';

const CLIENT_ID: string = '3f9a1b2c-4d5e-4f60-8a9b-c2e1d3f4a5b6';
const ITEM: string = '00000000-0000-4000-8000-00000000a001';

describe('saveCredentialsSchema', () => {
    it('aceita uuid e segredo imprimível de 16 a 256 caracteres, aparando as pontas', () => {
        expect(saveCredentialsSchema.parse({ clientId: ` ${CLIENT_ID} `, clientSecret: ' abcdefghijklmnop \n' })).toEqual({
            clientId: CLIENT_ID,
            clientSecret: 'abcdefghijklmnop'
        });
        expect(saveCredentialsSchema.safeParse({ clientId: CLIENT_ID, clientSecret: 'x'.repeat(256) }).success).toBe(true);
    });

    it.each([
        ['client id fora do formato uuid', { clientId: 'abc', clientSecret: 'abcdefghijklmnop' }],
        ['segredo curto', { clientId: CLIENT_ID, clientSecret: 'abcdefghijklmno' }],
        ['segredo longo', { clientId: CLIENT_ID, clientSecret: 'x'.repeat(257) }],
        ['segredo com espaço no meio', { clientId: CLIENT_ID, clientSecret: 'abcdefgh ijklmnop' }],
        ['segredo com acento', { clientId: CLIENT_ID, clientSecret: 'abcdefghijklmnopç' }],
        ['campos ausentes', {}]
    ])('recusa %s', (_label, body) => {
        expect(saveCredentialsSchema.safeParse(body).success).toBe(false);
    });
});

describe('connectItemsSchema', () => {
    it('apara, põe em minúsculas e junta os repetidos mantendo a ordem', () => {
        const parsed = connectItemsSchema.parse({ itemIds: [ITEM.toUpperCase(), `  ${ITEM} `, '00000000-0000-4000-8000-00000000a002'] });

        expect(parsed.itemIds).toEqual([ITEM, '00000000-0000-4000-8000-00000000a002']);
    });

    it.each([
        ['lista vazia', { itemIds: [] }],
        ['mais de 10', { itemIds: Array.from({ length: 11 }, (_unused, index) => `00000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`) }],
        ['id que não é uuid', { itemIds: ['segredo-colado-no-campo-errado-123'] }],
        ['sem lista', {}]
    ])('recusa %s', (_label, body) => {
        expect(connectItemsSchema.safeParse(body).success).toBe(false);
    });
});

describe('purgeQuerySchema', () => {
    it('assume false e aceita true', () => {
        expect(purgeQuerySchema.parse({}).purgeTransactions).toBe('false');
        expect(purgeQuerySchema.parse({ purgeTransactions: 'true' }).purgeTransactions).toBe('true');
        expect(purgeQuerySchema.safeParse({ purgeTransactions: 'sim' }).success).toBe(false);
    });
});

describe('SecretSafeValidationPipe', () => {
    const pipe: SecretSafeValidationPipe<{ clientId: string; clientSecret: string }> = new SecretSafeValidationPipe(saveCredentialsSchema);

    it('devolve o corpo validado', () => {
        expect(pipe.transform({ clientId: CLIENT_ID, clientSecret: 'abcdefghijklmnop' })).toEqual({ clientId: CLIENT_ID, clientSecret: 'abcdefghijklmnop' });
    });

    it('reporta só o caminho e a regra, sem ecoar o valor enviado', () => {
        const sentinel: string = 'vera-sentinel-com espaço-que-falha-a-regra';
        let thrown: unknown = null;
        try {
            pipe.transform({ clientId: sentinel, clientSecret: sentinel });
        } catch (error: unknown) {
            thrown = error;
        }

        expect(thrown).toMatchObject({
            code: 'validation_failed',
            status: 400,
            meta: {
                errors: [
                    { path: 'clientId', code: 'invalid_string' },
                    { path: 'clientSecret', code: 'invalid_string' }
                ]
            }
        });
        expect(JSON.stringify(thrown)).not.toContain('sentinel');
        expect((thrown as Error).message).not.toContain('sentinel');
    });

    it('reporta corpo que nem é objeto', () => {
        expect(() => pipe.transform('vera-sentinel')).toThrowError('validation_failed');
    });
});
