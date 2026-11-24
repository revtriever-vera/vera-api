import { describe, expect, it } from 'vitest';
import { redactArguments } from './mcp-redaction';

describe('redactArguments', () => {
    it('troca o valor das chaves sensíveis, em qualquer nível, e mantém o resto', () => {
        const input: unknown = {
            label: 'Parceiros',
            token: 'vera_pat_abc',
            nested: { apiKey: 'k', list: [{ password: 'p', keep: 1 }] }
        };

        expect(redactArguments(input)).toEqual({
            label: 'Parceiros',
            token: '[redacted]',
            nested: { apiKey: '[redacted]', list: [{ password: '[redacted]', keep: 1 }] }
        });
    });

    it('devolve o que não é objeto como está', () => {
        expect(redactArguments(null)).toBeNull();
        expect(redactArguments('texto')).toBe('texto');
        expect(redactArguments(3)).toBe(3);
    });
});
