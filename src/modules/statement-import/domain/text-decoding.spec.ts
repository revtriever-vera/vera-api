import { describe, expect, it } from 'vitest';
import { fixture } from '../../../../test/support/statement-fixtures';
import { decodeStatement } from './text-decoding';

describe('decodeStatement', () => {
    it('decodifica windows-1252 declarado no cabeçalho OFX, com ç e ã', () => {
        const text: string = decodeStatement(fixture('itau-conta-1.02.ofx'));

        expect(text).toContain('SALÁRIO EMPRESA X');
        expect(text).toContain('CONDOMÍNIO');
    });

    it('descarta o BOM do UTF-8', () => {
        const bytes: Buffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Descrição;ação', 'utf-8')]);

        expect(decodeStatement(bytes)).toBe('Descrição;ação');
    });

    it('lê UTF-8 sem BOM', () => {
        expect(decodeStatement(Buffer.from('Transferência recebida', 'utf-8'))).toBe('Transferência recebida');
    });

    it('cai para windows-1252 quando o UTF-8 é inválido e não há declaração', () => {
        const bytes: Buffer = Buffer.from([0x50, 0x61, 0x6f, 0x20, 0x64, 0x65, 0x20, 0x41, 0xe7, 0xfa, 0x63, 0x61, 0x72]);

        expect(decodeStatement(bytes)).toBe('Pao de Açúcar');
    });

    it('aceita ISO-8859-1 declarado como charset', () => {
        const bytes: Buffer = Buffer.from('OFXHEADER:100\r\nCHARSET:8859-1\r\n<OFX><NAME>Caf\xe9</NAME></OFX>', 'latin1');

        expect(decodeStatement(bytes)).toContain('Café');
    });
});
