import ExcelJS from 'exceljs';
import { ReportFile, SheetTable } from './sheet.types';

const FIXED_DATE: Date = new Date('2026-10-30T12:00:00Z');
const NUMBER_FORMAT: string = '#,##0.00####';

function fillSheet(workbook: ExcelJS.Workbook, sheet: SheetTable): void {
    const worksheet: ExcelJS.Worksheet = workbook.addWorksheet(sheet.name);
    worksheet.addRow([...sheet.headers]).font = { bold: true };
    sheet.rows.forEach((row: SheetTable['rows'][number]): void => {
        worksheet.addRow([...row]);
    });
    worksheet.columns.forEach((column: Partial<ExcelJS.Column>): void => {
        column.width = 24;
        column.numFmt = NUMBER_FORMAT;
    });
}

export async function reportToXlsx(report: ReportFile): Promise<Buffer> {
    const workbook: ExcelJS.Workbook = new ExcelJS.Workbook();
    workbook.creator = 'vera-fixtures';
    workbook.created = FIXED_DATE;
    workbook.modified = FIXED_DATE;
    report.sheets.forEach((sheet: SheetTable): void => {
        fillSheet(workbook, sheet);
    });
    const data: ExcelJS.Buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(data);
}
