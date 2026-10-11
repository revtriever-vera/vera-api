import { Workbook, Worksheet } from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildXlsx, currencyFormatOf, XlsxCell, XlsxColumn } from './xlsx';

const COLUMNS: readonly XlsxColumn[] = [
    { header: 'Date', type: 'date', width: 14 },
    { header: 'Text', type: 'text', width: 20 },
    { header: 'Amount', type: 'number', width: 16, numFmt: '#,##0.00' }
];

async function sheetOf(rows: readonly (readonly XlsxCell[])[]): Promise<Worksheet> {
    const workbook: Workbook = new Workbook();
    await workbook.xlsx.load(
        (await buildXlsx({ name: 'Data', columns: COLUMNS }, rows)) as unknown as Parameters<Workbook['xlsx']['load']>[0]
    );
    return workbook.worksheets[0] as Worksheet;
}

describe('buildXlsx', () => {
    it('writes a frozen bold header and typed cells', async () => {
        const sheet: Worksheet = await sheetOf([[new Date(Date.UTC(2026, 8, 5)), 'salary', -350.5]]);

        expect(sheet.name).toBe('Data');
        expect(sheet.getRow(1).values).toEqual([undefined, 'Date', 'Text', 'Amount']);
        expect(sheet.getRow(1).font.bold).toBe(true);
        expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
        expect((sheet.getCell('A2').value as Date).toISOString().slice(0, 10)).toBe('2026-09-05');
        expect(sheet.getCell('A2').numFmt).toBe('yyyy-mm-dd');
        expect(sheet.getCell('B2').value).toBe('salary');
        expect(sheet.getCell('C2').value).toBe(-350.5);
        expect(sheet.getCell('C2').numFmt).toBe('#,##0.00');
    });

    it('lets a cell carry its own number format and keeps nulls empty', async () => {
        const sheet: Worksheet = await sheetOf([[null, 'x', { value: 3, numFmt: '0' }]]);

        expect(sheet.getCell('A2').value).toBeNull();
        expect(sheet.getCell('C2').numFmt).toBe('0');
    });

    it('writes only the header without rows', async () => {
        expect((await sheetOf([])).rowCount).toBe(1);
    });
});

describe('currencyFormatOf', () => {
    it('builds formats for the currency', () => {
        expect(currencyFormatOf('BRL')).toBe('"R$" #,##0.00');
        expect(currencyFormatOf('USD')).toBe('"US$" #,##0.00');
        expect(currencyFormatOf('JPY')).toBe('"JPY" #,##0');
    });
});
