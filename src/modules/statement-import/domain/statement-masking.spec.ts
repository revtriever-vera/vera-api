import { describe, expect, it } from 'vitest';
import { REDACTED } from '../../../shared/utils/personal-data-redaction';
import { isTransactionLine, maskBankStatementText } from './statement-masking';

const HEADER: string = [
    'BANCO EXEMPLO S.A.',
    'Cliente: PESSOA EXEMPLO DA SILVA',
    'CPF: 111.222.333-96',
    'Agência: 1234 Conta corrente: 56789-0',
    'Titular',
    'OUTRA PESSOA EXEMPLO',
    'Extrato de 01/10/2026 a 31/10/2026'
].join('\n');

const LINES: string = [
    '02/10 PIX ENVIADO MARIA EXEMPLO -150,00',
    '05/10/2026 PAGAMENTO CONTA LUZ 210,35 D',
    '2026-10-07 MERCADO EXEMPLO 1.234,56'
].join('\n');

describe('maskBankStatementText', () => {
    it('mascara titular, documento, agência e conta do cabeçalho', () => {
        const masked: string = maskBankStatementText(HEADER);

        for (const secret of ['PESSOA EXEMPLO DA SILVA', '111.222.333-96', '1234 Conta', '56789-0', 'OUTRA PESSOA EXEMPLO']) {
            expect(masked).not.toContain(secret);
        }
        expect(masked).toContain(`Cliente: ${REDACTED}`);
        expect(masked).toContain('BANCO EXEMPLO S.A.');
    });

    it('mantém a linha de transação inteira, com a descrição que vai ao modelo, mesmo com a palavra conta', () => {
        expect(maskBankStatementText(LINES)).toBe(LINES);
    });

    it('rótulo sozinho não mascara a transação que vem logo depois', () => {
        const masked: string = maskBankStatementText(['Conta', '03/10 TARIFA CONTA 12,90'].join('\n'));

        expect(masked).toBe(['Conta', '03/10 TARIFA CONTA 12,90'].join('\n'));
    });

    it('documento solto dentro da transação sai pela redação de dados pessoais', () => {
        const masked: string = maskBankStatementText('04/10 PIX 111.222.333-96 -10,00');

        expect(masked).toBe(`04/10 PIX ${REDACTED} -10,00`);
    });
});

describe('isTransactionLine', () => {
    it('pede data e valor na mesma linha', () => {
        expect(isTransactionLine('12 OUT UBER TRIP 32,50')).toBe(true);
        expect(isTransactionLine('Saldo anterior 1.000,00')).toBe(false);
        expect(isTransactionLine('Extrato de 01/10/2026 a 31/10/2026')).toBe(false);
    });
});
