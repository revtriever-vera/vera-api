import { describe, expect, it } from 'vitest';
import { TrialEmailUtil } from './trial-email.util';

describe('TrialEmailUtil.canonical', () => {
    it('baixa a caixa e apara espaços', () => {
        expect(TrialEmailUtil.canonical('  Ana@Example.COM ')).toBe('ana@example.com');
    });

    it('no Gmail tira pontos e o sufixo depois do +', () => {
        expect(TrialEmailUtil.canonical('A.na.Silva+oferta@gmail.com')).toBe('anasilva@gmail.com');
    });

    it('trata googlemail como gmail', () => {
        expect(TrialEmailUtil.canonical('ana.silva@googlemail.com')).toBe('anasilva@gmail.com');
    });

    it('em outros domínios mantém pontos e +', () => {
        expect(TrialEmailUtil.canonical('ana.silva+x@empresa.com.br')).toBe('ana.silva+x@empresa.com.br');
    });

    it('devolve o texto como está quando não é um e-mail', () => {
        expect(TrialEmailUtil.canonical('sem-arroba')).toBe('sem-arroba');
    });
});
