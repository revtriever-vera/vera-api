import { AvenueDividend, AvenueFunds, AvenueMonth, AvenuePosition, AvenueTrade } from './avenue-data';
import { PdfLine } from './pdf-writer';
import { SYNTHETIC_HOLDER_NAME } from './synthetic-identity';

export const AVENUE_ACCOUNT: string = 'AVN-0009876';
const LEFT: number = 30;
const STEP: number = 12;
const COLUMN: number = 120;
const TOP: number = 560;

const BLOCK_TITLES: Readonly<Record<AvenuePosition['block'], string>> = {
    equities: 'EQUITIES',
    options: 'OPTIONS',
    fixed_income: 'FIXED INCOME'
};

function usd(minor: number): string {
    return (minor / 100).toFixed(2);
}

function row(y: number, cells: readonly string[], bold: boolean): PdfLine[] {
    return cells.map((text: string, index: number): PdfLine => ({ x: LEFT + index * COLUMN, y, size: 8, bold, text: text.slice(0, 19) }));
}

function tradeCells(trade: AvenueTrade): string[] {
    return [trade.date, trade.side, trade.symbol, trade.securityId, trade.quantity, trade.price];
}

function dividendCells(item: AvenueDividend): string[][] {
    return [
        [item.date, 'DIVIDEND', item.symbol, item.securityId, usd(item.grossMinor)],
        [item.date, 'NRA TAX WITHHELD', item.symbol, item.securityId, `-${usd(item.withheldMinor)}`]
    ];
}

function fundsCells(item: AvenueFunds): string[] {
    return [item.date, item.direction === 'credit' ? 'FUNDS RECEIVED' : 'FUNDS PAID', usd(item.amountMinor)];
}

function positionCells(item: AvenuePosition): string[] {
    return [item.symbol, item.securityId, item.quantity, item.price];
}

function section(
    title: string,
    header: readonly string[],
    rows: readonly (readonly string[])[],
    start: number
): { lines: PdfLine[]; next: number } {
    const lines: PdfLine[] = [{ x: LEFT, y: start, size: 9, bold: true, text: title }, ...row(start - STEP, header, true)];
    rows.forEach((cells: readonly string[], index: number): void => {
        lines.push(...row(start - STEP * (index + 2), cells, false));
    });
    return { lines, next: start - STEP * (rows.length + 3) };
}

function headerLines(month: AvenueMonth): PdfLine[] {
    return [
        { x: LEFT, y: TOP, size: 14, bold: true, text: 'AVENUE SECURITIES - MONTHLY STATEMENT (synthetic sample)' },
        { x: LEFT, y: TOP - 20, size: 8, bold: false, text: 'Custodian: APEX EXEMPLO CLEARING' },
        {
            x: LEFT,
            y: TOP - 32,
            size: 8,
            bold: false,
            text: `Account holder: ${SYNTHETIC_HOLDER_NAME}   Account number: ${AVENUE_ACCOUNT}`
        },
        { x: LEFT, y: TOP - 44, size: 8, bold: false, text: `Statement period: ${month.start} to ${month.end}` }
    ];
}

export function avenueStatementLines(month: AvenueMonth): PdfLine[] {
    const lines: PdfLine[] = headerLines(month);
    let cursor: number = TOP - 70;
    const blocks: readonly AvenuePosition['block'][] = ['equities', 'options', 'fixed_income'];
    lines.push({ x: LEFT, y: cursor, size: 10, bold: true, text: 'PORTFOLIO SUMMARY' });
    cursor -= STEP;
    for (const block of blocks) {
        const rows: string[][] = month.positions.filter((item: AvenuePosition): boolean => item.block === block).map(positionCells);
        if (rows.length > 0) {
            const built: { lines: PdfLine[]; next: number } = section(
                BLOCK_TITLES[block],
                ['SYMBOL', 'CUSIP', 'QUANTITY', 'PRICE'],
                rows,
                cursor
            );
            lines.push(...built.lines);
            cursor = built.next;
        }
    }
    lines.push({ x: LEFT, y: cursor, size: 10, bold: true, text: 'ACCOUNT ACTIVITY' });
    cursor -= STEP;
    const trades: { lines: PdfLine[]; next: number } = section(
        'BUY / SELL',
        ['DATE', 'ACTION', 'SYMBOL', 'CUSIP', 'QUANTITY', 'PRICE'],
        month.trades.map(tradeCells),
        cursor
    );
    lines.push(...trades.lines);
    const dividends: { lines: PdfLine[]; next: number } = section(
        'DIVIDENDS AND INTEREST',
        ['DATE', 'TYPE', 'SYMBOL', 'CUSIP', 'AMOUNT'],
        month.dividends.flatMap(dividendCells),
        trades.next
    );
    lines.push(...dividends.lines);
    lines.push(...section('FUNDS PAID AND RECEIVED', ['DATE', 'TYPE', 'AMOUNT'], month.funds.map(fundsCells), dividends.next).lines);
    return lines;
}
