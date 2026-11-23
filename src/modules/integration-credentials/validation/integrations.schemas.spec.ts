import { describe, expect, it } from 'vitest';
import { saveGoogleSchema, saveLlmSchema, saveWhatsAppSchema } from './integrations.schemas';

describe('schemas de integração', () => {
    it('exige o ID do número só com dígitos e o client ID do Google com o sufixo', () => {
        const whatsapp = { accessToken: 'token-12345', phoneNumberId: '12345678', verifyToken: 'verify-123', appSecret: 'secret-123' };

        expect(saveWhatsAppSchema.safeParse(whatsapp).success).toBe(true);
        expect(saveWhatsAppSchema.safeParse({ ...whatsapp, phoneNumberId: 'abc' }).success).toBe(false);
        expect(saveWhatsAppSchema.safeParse({ ...whatsapp, appSecret: undefined }).success).toBe(false);
        expect(saveGoogleSchema.safeParse({ clientId: '1-a.apps.googleusercontent.com', clientSecret: 'secret-123' }).success).toBe(true);
        expect(saveGoogleSchema.safeParse({ clientId: '1-a.example.com', clientSecret: 'secret-123' }).success).toBe(false);
    });

    it('aceita modelo local por http e recusa o endereço de metadados', () => {
        const base = { apiKey: 'key-12345678', model: 'llama3:8b' };

        expect(saveLlmSchema.safeParse({ ...base, baseUrl: 'http://localhost:11434/v1' }).success).toBe(true);
        expect(saveLlmSchema.safeParse({ ...base, baseUrl: 'http://169.254.169.254' }).success).toBe(false);
        expect(saveLlmSchema.safeParse({ ...base, baseUrl: 'https://api.example.com/v1', model: 'bad model' }).success).toBe(false);
    });
});
