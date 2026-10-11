import { describe, expect, it } from 'vitest';
import { fixture } from '../../../../test/support/statement-fixtures';
import { readCsv } from './csv-reader';
import { parseNubankAccountCsv } from './nubank-account-csv';
import { InvalidFileError } from './statement-import.errors';
import { decodeStatement } from './text-decoding';

function parse(text: string) {
    return parseNubankAccountCsv(readCsv(text, ',', 1000).records, 'BRL');
}

describe('parseNubankAccountCsv', () => {
    it('usa o Identificador como externalId, a data dd/MM/aaaa e o valor já com sinal', () => {
        const statement = parse(decodeStatement(fixture('nubank-conta.csv')));

        expect(statement.rows.map((row) => [row.date, row.amountMinor, row.externalId])).toEqual([
            ['2026-09-01', 500_000, 'csv:nubank:NU-ID-0001'],
            ['2026-09-02', -15_075, 'csv:nubank:NU-ID-0002'],
            ['2026-09-05', -4_500, 'csv:nubank:NU-ID-0003']
        ]);
        expect(statement.rows[0]?.description).toBe('Transferência recebida pelo Pix - FULANO DE TAL');
    });

    it('sem Identificador (ou gigante) deixa o fingerprint decidir', () => {
        const statement = parse(`Data,Valor,Identificador,Descrição\n01/09/2026,-1.00,,a\n01/09/2026,-2.00,${'x'.repeat(300)},b`);

        expect(statement.rows.map((row) => row.externalId)).toEqual([null, null]);
    });

    it('recusa cabeçalho diferente', () => {
        expect(() => parse('date,title,amount\n')).toThrow(InvalidFileError);
    });
});
