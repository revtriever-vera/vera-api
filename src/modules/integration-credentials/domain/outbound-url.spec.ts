import { describe, expect, it } from 'vitest';
import { hintOf } from './hint';
import { isAllowedModelUrl } from './outbound-url';

describe('isAllowedModelUrl', () => {
    it.each([
        'https://api.example.com/v1',
        'http://localhost:11434/v1',
        'http://192.168.0.10:8080/v1',
        'http://10.1.2.3/v1',
        'http://llm.internal/v1'
    ])('aceita %s', (url: string) => {
        expect(isAllowedModelUrl(url)).toBe(true);
    });

    it.each([
        'http://169.254.169.254/latest/meta-data',
        'https://169.254.169.254',
        'http://2852039166/',
        'http://metadata.google.internal/',
        'http://[fd00:ec2::254]/',
        'http://example.com/v1',
        'ftp://example.com',
        'file:///etc/passwd',
        'https://user:pass@example.com',
        'nao é url'
    ])('recusa %s', (url: string) => {
        expect(isAllowedModelUrl(url)).toBe(false);
    });
});

describe('hintOf', () => {
    it('mostra só os últimos 4 e esconde o que é curto demais', () => {
        expect(hintOf('sk-abcdefgh1234')).toBe('…1234');
        expect(hintOf('curto')).toBe('…');
    });
});
