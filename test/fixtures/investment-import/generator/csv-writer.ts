import { Cell, SheetTable } from './sheet.types';

const SEPARATOR: string = ';';

function csvCell(cell: Cell): string {
    if (cell === null) {
        return '';
    }
    return typeof cell === 'number' ? String(cell).replace('.', ',') : cell;
}

function csvLine(cells: readonly Cell[]): string {
    return cells.map(csvCell).join(SEPARATOR);
}

export function sheetToCsv(sheet: SheetTable): Buffer {
    const lines: string[] = [csvLine(sheet.headers), ...sheet.rows.map(csvLine)];
    return Buffer.from(`${lines.join('\r\n')}\r\n`, 'utf8');
}
