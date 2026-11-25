import { buildPdf, PdfLine } from './pdf-writer';
import { Cell, SheetTable } from './sheet.types';
import {
    SYNTHETIC_ACCOUNT,
    SYNTHETIC_BROKER,
    SYNTHETIC_CLIENT_CODE,
    SYNTHETIC_HOLDER_CPF,
    SYNTHETIC_HOLDER_NAME
} from './synthetic-identity';

interface PdfColumn {
    readonly header: string;
    readonly x: number;
}

const LEFT: number = 30;
const LINE_HEIGHT: number = 13;
const START_Y: number = 560;

function textLine(x: number, y: number, text: string, bold: boolean): PdfLine {
    return { x, y, size: 8, bold, text };
}

function cellText(cell: Cell | undefined): string {
    if (cell === null || cell === undefined) {
        return '-';
    }
    return typeof cell === 'number' ? String(cell).replace('.', ',') : cell;
}

function headerLines(): PdfLine[] {
    return [
        { x: LEFT, y: START_Y, size: 14, bold: true, text: 'Relatório de Posição - B3 (amostra sintética)' },
        textLine(LEFT, START_Y - 20, `Investidor: ${SYNTHETIC_HOLDER_NAME}   CPF: ${SYNTHETIC_HOLDER_CPF}`, false),
        textLine(
            LEFT,
            START_Y - 33,
            `Instituição: ${SYNTHETIC_BROKER}   Conta: ${SYNTHETIC_ACCOUNT}   Código do cliente: ${SYNTHETIC_CLIENT_CODE}`,
            false
        )
    ];
}

function tableColumns(sheet: SheetTable, names: readonly string[]): PdfColumn[] {
    return names.map((name: string, index: number): PdfColumn => ({ header: name, x: LEFT + index * 120 }));
}

function sectionLines(sheet: SheetTable, names: readonly string[], startY: number): PdfLine[] {
    const columns: PdfColumn[] = tableColumns(sheet, names);
    const indexes: number[] = names.map((name: string): number => sheet.headers.indexOf(name));
    const lines: PdfLine[] = [textLine(LEFT, startY, sheet.name.toUpperCase(), true)];
    columns.forEach((column: PdfColumn): void => {
        lines.push(textLine(column.x, startY - LINE_HEIGHT, column.header, true));
    });
    sheet.rows.forEach((row: SheetTable['rows'][number], rowIndex: number): void => {
        indexes.forEach((cellIndex: number, columnIndex: number): void => {
            const text: string = cellText(row[cellIndex]).slice(0, 26);
            lines.push(textLine(columns[columnIndex]?.x ?? LEFT, startY - LINE_HEIGHT * (rowIndex + 2), text, false));
        });
    });
    return lines;
}

const SECTION_COLUMNS: readonly string[] = ['Código de Negociação', 'Quantidade', 'Preço de Fechamento', 'Valor Atualizado'];
const FIXED_INCOME_COLUMNS: readonly string[] = ['Código', 'Indexador', 'Vencimento', 'Quantidade', 'Preço Atualizado CURVA'];

export function buildB3PositionPdf(sheets: readonly SheetTable[]): Buffer {
    const lines: PdfLine[] = headerLines();
    let cursor: number = START_Y - 60;
    sheets.forEach((sheet: SheetTable): void => {
        const names: readonly string[] = sheet.slug === 'renda-fixa' ? FIXED_INCOME_COLUMNS : SECTION_COLUMNS;
        lines.push(...sectionLines(sheet, names, cursor));
        cursor -= LINE_HEIGHT * (sheet.rows.length + 3);
    });
    return buildPdf(lines);
}
