import { describe, expect, it } from 'vitest';
import { redactSecrets } from './platform-account-redaction';

describe('redactSecrets', () => {
    it('drops keys that carry keys, credentials, hints and tokens at any depth', () => {
        const input: unknown = {
            credentials: { configured: true, clientIdHint: 'abcd' },
            connections: [{ connectorName: 'Banco', status: 'ok', itemIdHint: '1234', accessToken: 'x' }],
            nested: { apiKey: 'k', secretEncrypted: 's', cardBrand: 'visa', cardLast4: '4242', keep: 1 }
        };
        expect(redactSecrets(input)).toEqual({
            connections: [{ connectorName: 'Banco', status: 'ok' }],
            nested: { keep: 1 }
        });
    });

    it('keeps dates, primitives and empty collections as they are', () => {
        const at: Date = new Date('2026-01-01T00:00:00Z');
        expect(redactSecrets({ at, n: 3, none: null, list: [] })).toEqual({ at, n: 3, none: null, list: [] });
    });
});
