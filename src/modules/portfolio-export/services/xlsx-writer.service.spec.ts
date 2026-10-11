import { Cell, Workbook, Worksheet } from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildExportTable } from '../domain/export-rows';
import { holdingOf, snapshotOf } from '../domain/export-fixtures';
import { currencyFormatOf, quantityFormatOf, XlsxWriterService } from './xlsx-writer.service';

async function sheetOf(service: XlsxWriterService, locale: 'pt-BR' | 'en', currency: string): Promise<Worksheet> {
    const table = buildExportTable(
        snapshotOf(
            [holdingOf({ quantity: '0.45', quantityDecimals: 8 }), holdingOf({ symbol: '=1+1', quantity: null, quantityDecimals: null })],
            currency
        ),
        locale
    );
    const workbook: Workbook = new Workbook();
    await workbook.xlsx.load((await service.write(table)) as unknown as Parameters<Workbook['xlsx']['load']>[0]);
    return workbook.worksheets[0] as Worksheet;
}

describe('XlsxWriterService', () => {
    const service: XlsxWriterService = new XlsxWriterService();

    it('writes a frozen, bold header sheet named after the locale', async () => {
        const sheet: Worksheet = await sheetOf(service, 'pt-BR', 'BRL');

        expect(sheet.name).toBe('Carteira');
        expect(sheet.getRow(1).values).toEqual([undefined, 'Ativo', 'Nome', 'Classe', 'Quantidade', 'Valor (BRL)', 'Fonte do valor']);
        expect(sheet.getRow(1).font.bold).toBe(true);
        expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    });

    it('writes quantity and value as numeric cells with formats and text as plain strings', async () => {
        const sheet: Worksheet = await sheetOf(service, 'en', 'USD');

        const quantity: Cell = sheet.getCell('D2');
        const value: Cell = sheet.getCell('E2');
        expect(sheet.name).toBe('Portfolio');
        expect(quantity.value).toBe(0.45);
        expect(quantity.numFmt).toBe('0.00000000');
        expect(value.value).toBe(75_600);
        expect(value.numFmt).toBe('"US$" #,##0.00');
        expect(sheet.getCell('A3').value).toBe("'=1+1");
        expect(sheet.getCell('D3').value).toBeNull();
    });

    it('builds formats for the currency and the quantity decimals', () => {
        expect(currencyFormatOf('BRL')).toBe('"R$" #,##0.00');
        expect(currencyFormatOf('JPY')).toBe('"JPY" #,##0');
        expect(quantityFormatOf(0)).toBe('0');
        expect(quantityFormatOf(null)).toBe('0');
        expect(quantityFormatOf(2)).toBe('0.00');
    });
});
