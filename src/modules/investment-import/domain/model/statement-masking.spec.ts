import { describe, expect, it } from 'vitest';
import { maskStatementText } from './statement-masking';

const POISONED: string = [
    'NOTA DE NEGOCIAÇÃO   Nr. nota 4567   Folha 1   Data pregão 03/11/2026',
    'Cliente',
    'PESSOA EXEMPLO 123456-7',
    'C.P.F./C.N.P.J./Vínculo',
    '111.222.333-96',
    'Titular: PESSOA EXEMPLO DA SILVA',
    'Conta: 998877-6   Agência: 0001',
    'CPF 11122233396',
    'Bovespa C VISTA PETROBRAS PN N2 PETR4 100 38,50 3.850,00 D'
].join('\n');

describe('maskStatementText', () => {
    const masked: string = maskStatementText(POISONED);

    it('tira nome, CPF, conta, agência e código do cliente do cabeçalho', () => {
        for (const secret of ['PESSOA EXEMPLO', '123456-7', '111.222.333-96', '11122233396', '998877-6', '0001', 'DA SILVA']) {
            expect(masked).not.toContain(secret);
        }
    });

    it('mantém data do pregão, número da nota e os negócios', () => {
        expect(masked).toContain('Data pregão 03/11/2026');
        expect(masked).toContain('Nr. nota 4567');
        expect(masked).toContain('PETROBRAS PN N2 PETR4 100 38,50 3.850,00 D');
    });

    it('apaga CPF e e-mail soltos pelo mascarador geral', () => {
        const text: string = maskStatementText('contato ana@example.com e 529.982.247-25');
        expect(text).not.toContain('ana@');
        expect(text).not.toContain('529.982');
    });

    it('rótulo no fim do texto sem valor depois não quebra', () => {
        expect(maskStatementText('Cliente')).toBe('Cliente');
        expect(maskStatementText('')).toBe('');
    });
});
