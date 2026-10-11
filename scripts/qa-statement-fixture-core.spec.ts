import { describe, expect, it } from 'vitest';
import { decodeStatement } from '../src/modules/statement-import/domain/text-decoding';
import { parseOfx } from '../src/modules/statement-import/domain/ofx-parser';
import { readCsv } from '../src/modules/statement-import/domain/csv-reader';
import { parseGenericCsv } from '../src/modules/statement-import/domain/generic-csv';
import { buildQaStatementFiles, optionsFrom } from './qa-statement-fixture-core';

describe('buildQaStatementFiles', () => {
    const files = buildQaStatementFiles('2026-10-15');

    it('o OFX tem 6 transações do cartão: 2 iguais às da Pluggy no mês anterior e 4 novas no dia 1', () => {
        const statement = parseOfx(decodeStatement(files.ofx), null);

        expect(statement.accountHint).toEqual({ institution: 'Nubank', numberLast4: '4321' });
        expect(statement.rows.map((row) => [row.date, row.description, row.amountMinor])).toEqual([
            ['2026-09-09', 'UBER *TRIP', -3_250],
            ['2026-09-08', 'SPOTIFY', -3_490],
            ['2026-10-01', 'PADARIA ESTRELA', -1_800],
            ['2026-10-01', 'DROGASIL', -4_590],
            ['2026-10-01', 'POSTO IPIRANGA', -20_000],
            ['2026-10-01', 'LIVRARIA CULTURA', -12_000]
        ]);
        expect(files.ofx.toString('latin1')).toContain('CHARSET:1252');
        expect(files.ofx.toString('latin1')).toContain('<CCACCTFROM>');
    });

    it('o CSV usa ; vírgula decimal, dd/MM/yyyy e 3 linhas no dia 1', () => {
        const text: string = decodeStatement(files.csv);
        const statement = parseGenericCsv(
            readCsv(text, ';', 100).records,
            {
                hasHeader: true,
                dateColumn: 0,
                descriptionColumn: 1,
                amountColumn: 2,
                dateFormat: 'dd/MM/yyyy',
                decimalSeparator: ',',
                invertSign: false
            },
            'BRL'
        );

        expect(text.split('\n')[0]).toBe('Data;Histórico;Valor');
        expect(statement.rows.map((row) => [row.date, row.description, row.amountMinor])).toEqual([
            ['2026-10-01', 'MERCADO DO ZE', -5_230],
            ['2026-10-01', 'IFOOD *LANCHE', -3_500],
            ['2026-10-01', 'PIX RECEBIDO JOAO', 15_000]
        ]);
    });
});

describe('optionsFrom', () => {
    const now: Date = new Date('2026-10-15T12:00:00Z');

    it('lê --out e usa hoje por padrão', () => {
        expect(optionsFrom(['--out', '/tmp/x'], now)).toEqual({ out: '/tmp/x', today: '2026-10-15' });
        expect(optionsFrom(['--out', '/tmp/x', '--today', '2026-01-02'], now).today).toBe('2026-01-02');
    });

    it('recusa a falta de --out e uma data torta', () => {
        expect(() => optionsFrom([], now)).toThrow('usage');
        expect(() => optionsFrom(['--out'], now)).toThrow('usage');
        expect(() => optionsFrom(['--out', '/tmp/x', '--today', 'ontem'], now)).toThrow('--today');
    });
});
