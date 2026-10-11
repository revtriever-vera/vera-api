import { describe, expect, it } from 'vitest';
import { deleteAccountSchema } from './account.schemas';
import { facebookLoginSchema, googleLoginSchema, updatePreferencesSchema } from './auth.schemas';

describe('login schemas', () => {
    it('exigem credencial com ao menos 20 caracteres e rejeitam campo extra', () => {
        expect(googleLoginSchema.safeParse({ idToken: 'a'.repeat(20) }).success).toBe(true);
        expect(googleLoginSchema.safeParse({ idToken: 'a'.repeat(19) }).success).toBe(false);
        expect(googleLoginSchema.safeParse({ idToken: 'a'.repeat(20), x: 1 }).success).toBe(false);
        expect(facebookLoginSchema.safeParse({ accessToken: 'a'.repeat(20) }).success).toBe(true);
        expect(facebookLoginSchema.safeParse({ accessToken: 'curto' }).success).toBe(false);
    });
});

describe('updatePreferencesSchema', () => {
    it('aceita idioma válido, nulo para seguir a empresa e corpo vazio', () => {
        expect(updatePreferencesSchema.safeParse({ locale: 'en' }).success).toBe(true);
        expect(updatePreferencesSchema.safeParse({ locale: null }).success).toBe(true);
        expect(updatePreferencesSchema.safeParse({}).success).toBe(true);
    });

    it('rejeita idioma desconhecido e campo extra', () => {
        expect(updatePreferencesSchema.safeParse({ locale: 'fr' }).success).toBe(false);
        expect(updatePreferencesSchema.safeParse({ theme: 'dark' }).success).toBe(false);
    });
});

describe('deleteAccountSchema', () => {
    it('exige e-mail de confirmação válido', () => {
        expect(deleteAccountSchema.safeParse({ confirmEmail: 'user@example.com' }).success).toBe(true);
        expect(deleteAccountSchema.safeParse({ confirmEmail: 'user' }).success).toBe(false);
        expect(deleteAccountSchema.safeParse({}).success).toBe(false);
    });
});
