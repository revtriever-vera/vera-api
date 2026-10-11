import { describe, expect, it } from 'vitest';
import { DescriptionNormalizerService, normalizeDescription, PAYMENT_METHOD_PREFIXES } from './description-normalizer.service';

describe('normalizeDescription', () => {
    it.each([
        ['PAO DE ACUCAR 1243', 'PAO DE ACUCAR'],
        ['IFOOD *RESTAURANTE SABOR', 'IFOOD RESTAURANTE SABOR'],
        ['Pix enviado · Maria Souza', 'MARIA SOUZA'],
        ['UBER *TRIP', 'UBER TRIP']
    ])('normaliza %s para %s', (input: string, expected: string) => {
        expect(normalizeDescription(input)).toBe(expected);
    });

    it('devolve texto vazio para entrada vazia, só espaços ou só dígitos longos', () => {
        expect(normalizeDescription('')).toBe('');
        expect(normalizeDescription('   ')).toBe('');
        expect(normalizeDescription('1234567')).toBe('');
    });

    it('mantém sequências de até três dígitos', () => {
        expect(normalizeDescription('99 Pop 123')).toBe('99 POP 123');
    });

    it('remove acentos e cedilha', () => {
        expect(normalizeDescription('Açaí Pão Café São João')).toBe('ACAI PAO CAFE SAO JOAO');
    });

    it('troca asterisco, hífen, barra, ponto e sublinhado por espaço e colapsa', () => {
        expect(normalizeDescription('a*b-c/d.e_f')).toBe('A B C D E F');
    });

    it('remove datas dd/mm antes de a barra virar espaço', () => {
        expect(normalizeDescription('Compra 12/05 Padaria Estrela')).toBe('COMPRA PADARIA ESTRELA');
        expect(normalizeDescription('Padaria 12/05/2026')).toBe('PADARIA');
    });

    it.each(PAYMENT_METHOD_PREFIXES.map((prefix: string): [string] => [prefix]))('remove o prefixo %s', (prefix: string) => {
        expect(normalizeDescription(`${prefix}Loja Exemplo`)).toBe('LOJA EXEMPLO');
    });

    it('não remove o prefixo quando ele é a descrição inteira ou parte de uma palavra', () => {
        expect(normalizeDescription('PIX ENVIADO')).toBe('PIX ENVIADO');
        expect(normalizeDescription('PAGAMENTO FATURA NUBANK')).toBe('PAGAMENTO FATURA NUBANK');
    });

    it('corta em 120 caracteres', () => {
        expect(normalizeDescription('A'.repeat(300))).toHaveLength(120);
    });

    it('é idempotente nos exemplos fixados', () => {
        for (const text of ['PAO DE ACUCAR', 'IFOOD RESTAURANTE SABOR', 'MARIA SOUZA', 'UBER TRIP']) {
            expect(normalizeDescription(text)).toBe(text);
        }
    });
});

describe('DescriptionNormalizerService', () => {
    it('delega para a função pura', () => {
        expect(new DescriptionNormalizerService().normalize('Uber *Trip')).toBe('UBER TRIP');
    });
});
