import { describe, expect, it } from 'vitest';
import { isAllowedOrigin } from './cors-origin';

const APP: readonly string[] = ['https://app-dev.vera.example'];
const NONE: readonly string[] = [];

describe('cors origin', () => {
    it('aceita exatamente as origens da allowlist, em qualquer ambiente', () => {
        expect(isAllowedOrigin('https://app-dev.vera.example', false, APP)).toBe(true);
        expect(isAllowedOrigin('https://app-dev.vera.example', true, APP)).toBe(true);
    });

    it('recusa uma origem fora da allowlist fora do ambiente local', () => {
        expect(isAllowedOrigin('https://outra-origem.example.com', false, APP)).toBe(false);
    });

    it('no local, o loopback entra por cima disso, por conveniência de dev', () => {
        expect(isAllowedOrigin('http://localhost:5273', true, NONE)).toBe(true);
        expect(isAllowedOrigin('http://127.0.0.1:3000', true, NONE)).toBe(true);
    });

    it('o loopback não vale fora do local', () => {
        expect(isAllowedOrigin('http://localhost:5273', false, APP)).toBe(false);
        expect(isAllowedOrigin('http://127.0.0.1:3000', false, APP)).toBe(false);
    });

    it('exige o esquema exato da allowlist — um downgrade não casa', () => {
        expect(isAllowedOrigin('http://app-dev.vera.example', false, APP)).toBe(false);
    });

    it('deixa passar requisição sem Origin — curl e health check não são navegadores', () => {
        expect(isAllowedOrigin(undefined, false, NONE)).toBe(true);
        expect(isAllowedOrigin('', false, NONE)).toBe(true);
    });

    it('é case-insensitive, porque host é', () => {
        expect(isAllowedOrigin('https://APP-dev.Vera.EXAMPLE', false, APP)).toBe(true);
    });
});
