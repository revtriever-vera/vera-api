import { describe, expect, it } from 'vitest';
import { luhnValid, redactPersonalData, REDACTED } from '../../../shared/utils/personal-data-redaction';
import { redactTurns } from './ask-redaction';

describe('redactPersonalData', () => {
    it.each([
        ['CPF com pontuação', 'meu CPF é 529.982.247-25 ok'],
        ['CPF sem pontuação', 'meu CPF é 52998224725 ok'],
        ['CNPJ', 'a empresa 11.222.333/0001-81 ok'],
        ['CNPJ sem pontuação', 'a empresa 11222333000181 ok'],
        ['cartão com espaços', 'cartão 4111 1111 1111 1111 ok'],
        ['cartão com hífens', 'cartão 5555-5555-5555-4444 ok'],
        ['e-mail', 'escreva para ana.souza+vera@example.com.br ok'],
        ['telefone com DDD', 'ligue (11) 91234-5678 ok'],
        ['telefone internacional', 'ligue +55 11 91234-5678 ok'],
        ['telefone sem pontuação', 'ligue 11912345678 ok'],
        ['chave Pix aleatória', 'chave 123e4567-e89b-42d3-a456-426614174000 ok'],
        ['CEP', 'moro no 01310-100 ok'],
        ['CEP com a palavra', 'CEP 01310100 ok']
    ])('remove %s', (_name: string, text: string) => {
        const masked: string = redactPersonalData(text);
        expect(masked).toContain(REDACTED);
        expect(masked.startsWith('meu') || masked.endsWith('ok')).toBe(true);
        expect(masked).not.toMatch(/\d{5,}|@|[0-9a-f]{8}-/);
    });

    it('deixa passar dinheiro, datas e contagens', () => {
        const text: string = 'Foram R$ 3.200,50 em 2026-03, 18% a mais, 12345678901234 centavos e 1.234.567 no total';
        expect(redactPersonalData(text)).toBe('Foram R$ 3.200,50 em 2026-03, 18% a mais, 12345678901234 centavos e 1.234.567 no total');
    });

    it('não toca número de 11 dígitos que não é CPF válido nem telefone', () => {
        expect(redactPersonalData('saldo 12345678900')).toBe('saldo 12345678900');
    });

    it('mascara cada turno do histórico', () => {
        expect(redactTurns([{ role: 'person', text: 'a@b.co' }])).toEqual([{ role: 'person', text: REDACTED }]);
    });
});

describe('luhnValid', () => {
    it('valida o dígito verificador', () => {
        expect(luhnValid('4111 1111 1111 1111')).toBe(true);
        expect(luhnValid('4111 1111 1111 1112')).toBe(false);
        expect(luhnValid('1234')).toBe(false);
    });
});
