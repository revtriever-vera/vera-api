import { describe, expect, it } from 'vitest';
import { fixture } from '../../../../test/support/statement-fixtures';
import { detectFormat, firstLineOf, headerKey, isBinary } from './format-detector';
import { decodeStatement } from './text-decoding';

describe('detectFormat', () => {
    it('reconhece OFX 1.x pelo cabeçalho e OFX 2.x pela tag raiz', () => {
        expect(detectFormat(decodeStatement(fixture('itau-conta-1.02.ofx')))).toBe('ofx');
        expect(detectFormat(decodeStatement(fixture('bb-conta-2.ofx')))).toBe('ofx');
        expect(detectFormat('<OFX><BANKMSGSRSV1></BANKMSGSRSV1></OFX>')).toBe('ofx');
    });

    it('reconhece o CSV do cartão e o da conta do Nubank, com e sem BOM', () => {
        expect(detectFormat(decodeStatement(fixture('nubank-cartao.csv')))).toBe('csv_nubank_card');
        expect(detectFormat(decodeStatement(fixture('nubank-conta.csv')))).toBe('csv_nubank_account');
        expect(detectFormat('﻿date,title,amount\n2026-09-01,x,1.00')).toBe('csv_nubank_card');
        expect(detectFormat('"DATA","VALOR","IDENTIFICADOR","DESCRICAO"\n')).toBe('csv_nubank_account');
    });

    it('trata qualquer outro CSV como genérico', () => {
        expect(detectFormat(decodeStatement(fixture('generico-ponto-virgula.csv')))).toBe('csv_generic');
        expect(detectFormat('a,b,c\n1,2,3')).toBe('csv_generic');
    });

    it('recusa arquivo binário e texto sem delimitador', () => {
        expect(detectFormat('PK\u0003\u0004\u0000\u0000binary')).toBeNull();
        expect(isBinary('abc\u0000def')).toBe(true);
        expect(isBinary('linha\r\ncom\ttab')).toBe(false);
        expect(detectFormat('apenas uma palavra')).toBeNull();
        expect(detectFormat('')).toBeNull();
    });

    it('ignora acento e caixa na comparação do cabeçalho', () => {
        expect(headerKey(' "Descrição" , Valor ')).toBe('descricao,valor');
        expect(firstLineOf('﻿primeira\r\nsegunda')).toBe('primeira');
        expect(firstLineOf('única')).toBe('única');
    });
});
