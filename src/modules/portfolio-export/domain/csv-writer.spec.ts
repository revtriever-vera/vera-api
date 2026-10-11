import { describe, expect, it } from 'vitest';
import { AppLocale } from '../../../shared/i18n/locale';
import { writeCsv } from './csv-writer';
import { buildExportTable } from './export-rows';
import { holdingOf, snapshotOf } from './export-fixtures';
import { ExportHoldingInput } from './export.types';

function csvOf(holdings: readonly ExportHoldingInput[], locale: AppLocale, currency: string = 'BRL'): string {
    return writeCsv(buildExportTable(snapshotOf(holdings, currency), locale));
}

describe('writeCsv', () => {
    it('starts with the BOM, uses CRLF and writes the pt-BR header with semicolons', () => {
        const csv: string = csvOf([holdingOf({})], 'pt-BR');

        expect(csv.startsWith('﻿')).toBe(true);
        expect(csv.split('\r\n')).toEqual([
            '﻿Ativo;Nome;Classe;Quantidade;Valor (BRL);Fonte do valor',
            'ITUB4;Itaú Unibanco;Ações Brasil;2000;75600,00;B3 via brapi',
            ''
        ]);
    });

    it('writes the value without thousand separator or currency symbol, with decimal comma in pt-BR', () => {
        const csv: string = csvOf([holdingOf({ valueMinor: 123_456 })], 'pt-BR');

        expect(csv).toContain(';1234,56;');
        expect(csv).not.toContain('R$');
    });

    it('uses comma delimiter and decimal point in en', () => {
        const csv: string = csvOf([holdingOf({ quantity: '0.45', valueMinor: 123_456 })], 'en', 'USD');

        expect(csv.split('\r\n')).toEqual([
            '﻿Asset,Name,Class,Quantity,Value (USD),Value source',
            'ITUB4,Itaú Unibanco,Ações Brasil,0.45,1234.56,B3 via brapi',
            ''
        ]);
    });

    it('quotes fields with delimiter, quote or line break and doubles the quotes', () => {
        const csv: string = csvOf(
            [holdingOf({ name: 'A;B', symbol: 'say "hi"', classId: null }), holdingOf({ name: 'line\nbreak' })],
            'pt-BR'
        );

        expect(csv).toContain('"say ""hi""";"A;B";;');
        expect(csv).toContain('"line\nbreak"');
    });

    it('quotes the same fields with the comma delimiter in en', () => {
        const csv: string = csvOf([holdingOf({ name: 'A, B' })], 'en');

        expect(csv).toContain('"A, B"');
    });

    it('preserves fractional quantities without scientific notation and leaves fixed income quantity empty', () => {
        const csv: string = csvOf(
            [
                holdingOf({ quantity: '0.45' }),
                holdingOf({ quantity: '3.2' }),
                holdingOf({ quantity: '0.00000001' }),
                holdingOf({ quantity: null })
            ],
            'pt-BR'
        );

        const lines: string[] = csv.split('\r\n');
        expect(lines[1]).toContain(';0,45;');
        expect(lines[2]).toContain(';3,2;');
        expect(lines[3]).toContain(';0,00000001;');
        expect(lines[4]).toContain('Ações Brasil;;75600,00');
    });

    it('keeps the apostrophe of neutralized text and the sign of negative numbers untouched', () => {
        const csv: string = csvOf([holdingOf({ name: '=1+1', valueMinor: -123_456 })], 'pt-BR');

        expect(csv).toContain(";'=1+1;");
        expect(csv).toContain(';-1234,56;');
    });

    it('writes only the header for an empty portfolio', () => {
        expect(csvOf([], 'pt-BR').split('\r\n')).toEqual(['﻿Ativo;Nome;Classe;Quantidade;Valor (BRL);Fonte do valor', '']);
    });
});
