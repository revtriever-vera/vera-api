import { describe, expect, it } from 'vitest';
import { detectDelimiter, readCsv } from './csv-reader';

describe('detectDelimiter', () => {
    it('escolhe pela contagem na primeira linha', () => {
        expect(detectDelimiter('Data;Histórico;Valor')).toBe(';');
        expect(detectDelimiter('date,title,amount')).toBe(',');
        expect(detectDelimiter('uma coluna')).toBe(',');
    });
});

describe('readCsv', () => {
    it('lê aspas, aspas duplicadas e delimitador dentro de aspas', () => {
        const scan = readCsv('a;"b;c";"d ""e"" f"\n1;2;3\n', ';', 100);

        expect(scan.records.map((record) => record.cells)).toEqual([
            ['a', 'b;c', 'd "e" f'],
            ['1', '2', '3']
        ]);
        expect(scan.unterminatedQuote).toBe(false);
    });

    it('mantém quebra de linha dentro de aspas e conta a linha física do início', () => {
        const scan = readCsv('x,y\n"linha 1\nlinha 2",z\nfim,w', ',', 100);

        expect(scan.records.map((record) => record.line)).toEqual([1, 2, 4]);
        expect(scan.records[1]?.cells[0]).toBe('linha 1\nlinha 2');
    });

    it('aceita CRLF, CR sozinho e ignora linhas em branco', () => {
        const scan = readCsv('a,b\r\n\r\n1,2\r3,4\r\n', ',', 100);

        expect(scan.records.map((record) => record.cells)).toEqual([
            ['a', 'b'],
            ['1', '2'],
            ['3', '4']
        ]);
    });

    it('trata aspas no meio do campo como texto', () => {
        expect(readCsv('5" tela,ok', ',', 10).records[0]?.cells).toEqual(['5" tela', 'ok']);
    });

    it('avisa aspa sem fechamento e excesso de registros', () => {
        expect(readCsv('a,"b\nc', ',', 10).unterminatedQuote).toBe(true);
        const overflow = readCsv('1\n2\n3\n4', ',', 3);
        expect(overflow.overflow).toBe(true);
    });

    it('corta campos gigantes', () => {
        const scan = readCsv(`${'x'.repeat(5000)},fim`, ',', 10);

        expect(scan.records[0]?.cells[0]).toHaveLength(500);
        expect(scan.records[0]?.cells[1]).toBe('fim');
    });
});
