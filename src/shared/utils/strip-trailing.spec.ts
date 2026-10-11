import { describe, expect, it } from 'vitest';
import { stripTrailing } from './strip-trailing';

describe('stripTrailing', () => {
    it('remove todas as ocorrências finais do caractere', () => {
        expect(stripTrailing('https://a.test///', '/')).toBe('https://a.test');
        expect(stripTrailing('https://a.test/', '/')).toBe('https://a.test');
        expect(stripTrailing('1.500', '0')).toBe('1.5');
    });

    it('preserva ocorrências no meio e no início', () => {
        expect(stripTrailing('/a//b/', '/')).toBe('/a//b');
        expect(stripTrailing('0100', '0')).toBe('01');
    });

    it('lida com vazio, só o caractere e ausência dele', () => {
        expect(stripTrailing('', '/')).toBe('');
        expect(stripTrailing('////', '/')).toBe('');
        expect(stripTrailing('abc', '/')).toBe('abc');
    });

    it('respeita o limite de remoções', () => {
        expect(stripTrailing('10.', '.', 1)).toBe('10');
        expect(stripTrailing('10..', '.', 1)).toBe('10.');
        expect(stripTrailing('abc', '.', 1)).toBe('abc');
    });

    it('é linear em entradas longas e adversariais', () => {
        const hostile: string = `${'/'.repeat(200_000)}x`;
        expect(stripTrailing(hostile, '/')).toBe(hostile);
        expect(stripTrailing('/'.repeat(200_000), '/')).toBe('');
    });
});
