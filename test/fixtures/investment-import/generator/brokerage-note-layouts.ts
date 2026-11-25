import { grossCentsOf, NoteFees, NoteSpec, NoteTotals, NoteTrade, totalsOf } from './brokerage-note-data';
import { PdfLine } from './pdf-writer';
import { brDate } from './report-format';
import {
    SYNTHETIC_ACCOUNT,
    SYNTHETIC_BROKER,
    SYNTHETIC_CLIENT_CODE,
    SYNTHETIC_HOLDER_CPF,
    SYNTHETIC_HOLDER_NAME
} from './synthetic-identity';

interface Cell {
    readonly x: number;
    readonly text: string;
    readonly bold?: boolean;
}

const LEFT: number = 30;
const TOP: number = 560;
const STEP: number = 12;
const SIZE: number = 8;
const FIRST_PAGE_ROWS: number = 3;
const SETTLEMENT_DAYS: number = 2;

class Page {
    private readonly lines: PdfLine[] = [];
    private y: number = TOP;

    public row(cells: readonly Cell[], gap: number = STEP): void {
        cells.forEach((cell: Cell): void => {
            this.lines.push({ x: cell.x, y: this.y, size: SIZE, bold: cell.bold ?? false, text: cell.text });
        });
        this.y -= gap;
    }

    public title(text: string): void {
        this.lines.push({ x: LEFT, y: this.y, size: 12, bold: true, text });
        this.y -= STEP * 2;
    }

    public skip(): void {
        this.y -= STEP;
    }

    public done(): PdfLine[] {
        return this.lines;
    }
}

export function money(cents: number): string {
    const sign: string = cents < 0 ? '-' : '';
    const absolute: number = Math.abs(cents);
    const whole: string = String(Math.floor(absolute / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${sign}${whole},${String(absolute % 100).padStart(2, '0')}`;
}

function price(cents: number): string {
    return money(cents);
}

function settlementDate(date: string): string {
    const settled: Date = new Date(`${date}T12:00:00Z`);
    let remaining: number = SETTLEMENT_DAYS;
    while (remaining > 0) {
        settled.setUTCDate(settled.getUTCDate() + 1);
        const weekday: number = settled.getUTCDay();
        remaining -= weekday === 0 || weekday === 6 ? 0 : 1;
    }
    return brDate(settled.toISOString().slice(0, 10));
}

function header(page: Page, note: NoteSpec, sheet: string): void {
    page.title('NOTA DE NEGOCIACAO');
    page.row([
        { x: LEFT, text: 'Nr. nota', bold: true },
        { x: 150, text: 'Folha', bold: true },
        { x: 230, text: 'Data pregao', bold: true }
    ]);
    page.row([
        { x: LEFT, text: note.number },
        { x: 150, text: sheet },
        { x: 230, text: brDate(note.date) }
    ]);
    page.row([{ x: LEFT, text: `${SYNTHETIC_BROKER} S.A. C.V.M.C.C.` }]);
    page.skip();
}

function client(page: Page, poisoned: boolean): void {
    page.row([
        { x: LEFT, text: 'Cliente', bold: true },
        { x: 220, text: 'C.P.F./C.N.P.J./Vinculo', bold: true },
        { x: 420, text: 'Conta Corrente', bold: true }
    ]);
    page.row([
        { x: LEFT, text: `${SYNTHETIC_CLIENT_CODE} ${SYNTHETIC_HOLDER_NAME}` },
        { x: 220, text: SYNTHETIC_HOLDER_CPF },
        { x: 420, text: SYNTHETIC_ACCOUNT }
    ]);
    if (poisoned) {
        page.row([{ x: LEFT, text: `Nome: ${SYNTHETIC_HOLDER_NAME}` }]);
        page.row([{ x: LEFT, text: `CPF: ${SYNTHETIC_HOLDER_CPF}` }]);
        page.row([{ x: LEFT, text: `Codigo do cliente: ${SYNTHETIC_CLIENT_CODE}` }]);
        page.row([{ x: LEFT, text: 'Agencia: 0123   Telefone: (11) 99999-0000   E-mail: pessoa@exemplo.test' }]);
    }
    page.skip();
}

function tradeHeader(page: Page): void {
    const labels: readonly [number, string][] = [
        [30, 'Q'],
        [45, 'Negociacao'],
        [125, 'C/V'],
        [155, 'Tipo mercado'],
        [255, 'Prazo'],
        [295, 'Especificacao do titulo'],
        [505, 'Obs.'],
        [540, 'Quantidade'],
        [600, 'Preco / Ajuste'],
        [705, 'Valor Operacao'],
        [800, 'D/C']
    ];
    page.row(labels.map(([x, text]: readonly [number, string]): Cell => ({ x, text, bold: true })));
}

function tradeRow(page: Page, trade: NoteTrade): void {
    page.row([
        { x: 30, text: '1' },
        { x: 45, text: '1-BOVESPA' },
        { x: 125, text: trade.side === 'buy' ? 'C' : 'V' },
        { x: 155, text: trade.market },
        { x: 295, text: trade.spec },
        { x: 505, text: trade.dayTrade === true ? 'D' : '' },
        { x: 540, text: String(trade.quantity) },
        { x: 600, text: price(trade.priceCents) },
        { x: 705, text: money(grossCentsOf(trade)) },
        { x: 800, text: trade.side === 'buy' ? 'D' : 'C' }
    ]);
}

function sumOf(note: NoteSpec, side: 'buy' | 'sell', market: (trade: NoteTrade) => boolean): number {
    return note.trades
        .filter((trade: NoteTrade): boolean => trade.side === side && market(trade))
        .reduce((total: number, trade: NoteTrade): number => total + grossCentsOf(trade), 0);
}

function isOption(trade: NoteTrade): boolean {
    return trade.market.startsWith('OPCAO');
}

function dealsSummary(page: Page, note: NoteSpec, totals: NoteTotals): void {
    page.row([{ x: LEFT, text: 'Resumo dos Negocios', bold: true }]);
    const rows: readonly [string, number][] = [
        ['Vendas a vista', sumOf(note, 'sell', (trade: NoteTrade): boolean => !isOption(trade))],
        ['Compras a vista', sumOf(note, 'buy', (trade: NoteTrade): boolean => !isOption(trade))],
        ['Opcoes - compras', sumOf(note, 'buy', isOption)]
    ];
    rows.forEach(([label, cents]: readonly [string, number]): void => {
        page.row([
            { x: LEFT, text: label },
            { x: 250, text: money(cents) }
        ]);
    });
    page.row([
        { x: LEFT, text: 'Valor das operacoes', bold: true },
        { x: 250, text: money(note.printedTotalCents ?? totals.volumeCents), bold: true }
    ]);
    page.skip();
}

function financialSummary(page: Page, note: NoteSpec, totals: NoteTotals): void {
    const fees: NoteFees = totals.fees;
    page.row([{ x: LEFT, text: 'Resumo Financeiro', bold: true }]);
    const rows: readonly [string, string][] = [
        ['Taxa de liquidacao', money(fees.settlementCents)],
        ['Taxa de Registro', '0,00'],
        ['Emolumentos', money(fees.exchangeCents)],
        ['Corretagem', money(fees.brokerageCents)],
        ['ISS', money(fees.issCents)],
        ['I.R.R.F. s/ operacoes, base R$ 0,00', money(fees.irrfCents)],
        ['Outras', '0,00']
    ];
    rows.forEach(([label, value]: readonly [string, string]): void => {
        page.row([
            { x: LEFT, text: label },
            { x: 250, text: value }
        ]);
    });
    page.row([
        { x: LEFT, text: `Liquido para ${settlementDate(note.date)}`, bold: true },
        { x: 250, text: money(Math.abs(totals.netCents)), bold: true },
        { x: 320, text: totals.netCents < 0 ? 'D' : 'C', bold: true }
    ]);
}

function sinacorPage(
    note: NoteSpec,
    poisoned: boolean,
    parts: { readonly rows: readonly NoteTrade[]; readonly sheet: string; readonly summaries: boolean }
): PdfLine[] {
    const page: Page = new Page();
    const totals: NoteTotals = totalsOf(note);
    header(page, note, parts.sheet);
    client(page, poisoned);
    tradeHeader(page);
    parts.rows.forEach((trade: NoteTrade): void => {
        tradeRow(page, trade);
    });
    page.skip();
    if (parts.summaries) {
        dealsSummary(page, note, totals);
        financialSummary(page, note, totals);
    } else {
        page.row([{ x: LEFT, text: 'Continua na proxima pagina' }]);
    }
    return page.done();
}

function reorderedPage(note: NoteSpec, poisoned: boolean): PdfLine[] {
    const page: Page = new Page();
    const totals: NoteTotals = totalsOf(note);
    header(page, note, '1');
    financialSummary(page, note, totals);
    page.skip();
    dealsSummary(page, note, totals);
    client(page, poisoned);
    tradeHeader(page);
    note.trades.forEach((trade: NoteTrade): void => {
        tradeRow(page, trade);
    });
    return page.done();
}

function ownPage(note: NoteSpec): PdfLine[] {
    const page: Page = new Page();
    const totals: NoteTotals = totalsOf(note);
    const fees: NoteFees = totals.fees;
    page.title(`CONFIRMACAO DE OPERACOES - ${SYNTHETIC_BROKER}`);
    page.row([{ x: LEFT, text: `Nota ${note.number} em ${brDate(note.date)}` }]);
    page.row([{ x: LEFT, text: `Titular: ${SYNTHETIC_HOLDER_NAME}   CPF: ${SYNTHETIC_HOLDER_CPF}` }]);
    page.row([{ x: LEFT, text: `Cod. cliente: ${SYNTHETIC_CLIENT_CODE}   Conta: ${SYNTHETIC_ACCOUNT}` }]);
    page.skip();
    const labels: readonly [number, string][] = [
        [30, 'Papel'],
        [110, 'Descricao'],
        [330, 'Op'],
        [400, 'Qtd'],
        [470, 'Preco'],
        [560, 'Total']
    ];
    page.row(labels.map(([x, text]: readonly [number, string]): Cell => ({ x, text, bold: true })));
    note.trades.forEach((trade: NoteTrade): void => {
        page.row([
            { x: 30, text: trade.printedCode ?? '' },
            { x: 110, text: trade.spec },
            { x: 330, text: trade.side === 'buy' ? 'Compra' : 'Venda' },
            { x: 400, text: String(trade.quantity) },
            { x: 470, text: price(trade.priceCents) },
            { x: 560, text: money(grossCentsOf(trade)) }
        ]);
    });
    page.skip();
    const rows: readonly [string, number][] = [
        ['Total das operacoes', note.printedTotalCents ?? totals.volumeCents],
        ['Taxa de liquidacao', fees.settlementCents],
        ['Emolumentos', fees.exchangeCents],
        ['Corretagem', fees.brokerageCents],
        ['ISS', fees.issCents],
        ['IRRF', fees.irrfCents]
    ];
    rows.forEach(([label, cents]: readonly [string, number]): void => {
        page.row([
            { x: LEFT, text: label },
            { x: 250, text: money(cents) }
        ]);
    });
    page.row([
        { x: LEFT, text: `Liquido para ${settlementDate(note.date)}`, bold: true },
        { x: 250, text: money(Math.abs(totals.netCents)), bold: true },
        { x: 320, text: totals.netCents < 0 ? 'D' : 'C', bold: true }
    ]);
    return page.done();
}

export function notePages(layout: string, note: NoteSpec, poisoned: boolean): PdfLine[][] {
    if (layout === 'sinacor-reordered') {
        return [reorderedPage(note, poisoned)];
    }
    if (layout === 'own') {
        return [ownPage(note)];
    }
    if (layout === 'two-pages') {
        return [
            sinacorPage(note, poisoned, { rows: note.trades.slice(0, FIRST_PAGE_ROWS), sheet: '1/2', summaries: false }),
            sinacorPage(note, poisoned, { rows: note.trades.slice(FIRST_PAGE_ROWS), sheet: '2/2', summaries: true })
        ];
    }
    return [sinacorPage(note, poisoned, { rows: note.trades, sheet: '1', summaries: true })];
}
