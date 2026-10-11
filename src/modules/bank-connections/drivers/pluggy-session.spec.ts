import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { PluggyCredentialsPlain, PluggySession } from './pluggy-session';

const API_KEY: string = 'api-key-sentinel-123';
const SECRET: string = 'secret-sentinel-456789';

describe('PluggySession', () => {
    const session: PluggySession = new PluggySession(API_KEY);

    it('não mostra a chave em JSON, inspect nem interpolação', () => {
        expect(JSON.stringify(session)).toBe('"[redacted]"');
        expect(JSON.stringify({ session })).not.toContain(API_KEY);
        expect(inspect(session)).toBe('[redacted]');
        expect(String(session)).toBe('[redacted]');
        expect(session.toString()).not.toContain(API_KEY);
    });

    it('entrega a chave só pelo método explícito', () => {
        expect(session.headerValue()).toBe(API_KEY);
    });
});

describe('PluggyCredentialsPlain', () => {
    const credentials: PluggyCredentialsPlain = new PluggyCredentialsPlain('client-id', SECRET);

    it('não mostra o segredo em JSON, inspect nem interpolação', () => {
        expect(JSON.stringify(credentials)).toBe('"[redacted]"');
        expect(inspect(credentials)).toBe('[redacted]');
        expect(String(credentials)).toBe('[redacted]');
        expect(JSON.stringify({ nested: { credentials } })).not.toContain(SECRET);
    });

    it('serializa de forma explícita para selar e volta igual', () => {
        const restored: PluggyCredentialsPlain = PluggyCredentialsPlain.fromSealedJson(credentials.toSealableJson());

        expect(restored.pair()).toEqual({ clientId: 'client-id', clientSecret: SECRET });
        expect(restored.clientIdValue).toBe('client-id');
    });
});
