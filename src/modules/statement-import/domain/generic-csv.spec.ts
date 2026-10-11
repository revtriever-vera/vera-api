import { describe, expect, it } from 'vitest';
import { fixture } from '../../../../test/support/statement-fixtures';
import { readCsv } from './csv-reader';
import { describeGenericCsv, parseGenericCsv } from './generic-csv';
import { CsvMapping } from './statement-import.types';
import { decodeStatement } from './text-decoding';

const BASE: CsvMapping = {
    hasHeader: true,
    dateColumn: 0,
    descriptionColumn: 1,
    amountColumn: 2,
    dateFormat: 'dd/MM/yyyy',
    decimalSeparator: ',',
    invertSign: false
};

function parse(text: string, mapping: CsvMapping, delimiter: ',' | ';' = ';') {
    return parseGenericCsv(readCsv(text, delimiter, 1000).records, mapping, 'BRL');
}

describe('parseGenericCsv', () => {
    it('lê o CSV do fixture com milhar 1.234,56 e aspas com ; dentro', () => {
        const statement = parse(decodeStatement(fixture('generico-ponto-virgula.csv')), BASE);

        expect(statement.rows.map((row) => [row.date, row.amountMinor, row.description])).toEqual([
            ['2026-09-01', -5_230, 'MERCADO DO ZE'],
            ['2026-09-02', -3_500, 'IFOOD *LANCHE'],
            ['2026-09-03', 15_000, 'PIX RECEBIDO JOAO'],
            ['2026-09-04', -123_456, 'LOJA; FILIAL 2']
        ]);
        expect(statement.columns).toEqual(['Data', 'Histórico', 'Valor']);
    });

    it('lê débito e crédito em colunas separadas', () => {
        const mapping: CsvMapping = { ...BASE, amountColumn: undefined, debitColumn: 2, creditColumn: 3 };

        const statement = parse('d;h;deb;cred\n01/09/2026;a;10,00;\n02/09/2026;b;;5,50\n03/09/2026;c;;\n04/09/2026;d;x;', mapping);

        expect(statement.rows.map((row) => row.amountMinor)).toEqual([-1_000, 550]);
        expect(statement.rejections).toEqual([
            { line: 4, reason: 'invalid_amount' },
            { line: 5, reason: 'invalid_amount' }
        ]);
    });

    it('inverte o sinal quando o arquivo mostra a despesa positiva', () => {
        const statement = parse('d;h;v\n01/09/2026;a;10,00\n02/09/2026;b;-3,00', { ...BASE, invertSign: true });

        expect(statement.rows.map((row) => row.amountMinor)).toEqual([-1_000, 300]);
    });

    it('lê dd/MM/yy, yyyy-MM-dd e MM/dd/yyyy com separador decimal ponto', () => {
        const dot: CsvMapping = { ...BASE, decimalSeparator: '.' };

        expect(parse('01/09/26;a;1,234.50', { ...dot, hasHeader: false, dateFormat: 'dd/MM/yy' }).rows[0]).toMatchObject({
            date: '2026-09-01',
            amountMinor: 123_450
        });
        expect(parse('2026-09-02;a;2.00', { ...dot, hasHeader: false, dateFormat: 'yyyy-MM-dd' }).rows[0]?.date).toBe('2026-09-02');
        expect(parse('09/30/2026;a;2.00', { ...dot, hasHeader: false, dateFormat: 'MM/dd/yyyy' }).rows[0]?.date).toBe('2026-09-30');
    });

    it('linha inválida vira rejected com o número da linha, sem o conteúdo', () => {
        const statement = parse(
            'd;h;v\n31/02/2026;a;1,00\n01/09/2026;b;lixo\n01/09/2026;c;0,00\n01/09/2026; ;1,00\n01/09/2026;ok;1,00',
            BASE
        );

        expect(statement.rejections).toEqual([
            { line: 2, reason: 'invalid_date' },
            { line: 3, reason: 'invalid_amount' },
            { line: 4, reason: 'zero_amount' },
            { line: 5, reason: 'empty_description' }
        ]);
        expect(statement.rows).toHaveLength(1);
    });

    it('nomeia as colunas pelo cabeçalho ou por "Coluna n"', () => {
        const records = readCsv('a;;c\n1;2;3', ';', 10).records;

        expect(parseGenericCsv(records, BASE, 'BRL').columns).toEqual(['a', 'Coluna 2', 'c']);
        expect(parseGenericCsv(records, { ...BASE, hasHeader: false }, 'BRL').columns).toEqual(['Coluna 1', 'Coluna 2', 'Coluna 3']);
    });

    it('sem mapping devolve só as colunas e a quantidade de linhas de dados', () => {
        const statement = describeGenericCsv(readCsv('Data;Histórico;Valor\n1;2;3\n4;5;6', ';', 10).records);

        expect(statement).toMatchObject({ rows: [], columns: ['Data', 'Histórico', 'Valor'], pendingMappingRecords: 2 });
    });
});
