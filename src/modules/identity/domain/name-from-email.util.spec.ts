import { describe, expect, it } from 'vitest';
import { nameFromEmail } from './name-from-email.util';

describe('nameFromEmail', () => {
    it('capitaliza as partes separadas por ponto, hífen e sublinhado', () => {
        expect(nameFromEmail('maria.silva-souza_lima@example.test')).toBe('Maria Silva Souza Lima');
    });

    it('mantém a parte local quando só há separadores', () => {
        expect(nameFromEmail('..@example.test')).toBe('..');
    });
});
