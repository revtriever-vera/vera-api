import {
    grossCentsOf,
    NOTE_CATALOG,
    NOTE_DOCUMENTS,
    NoteDocument,
    NoteFees,
    NoteSpec,
    NoteTotals,
    NoteTrade,
    OPTION_MARKET,
    totalsOf
} from './brokerage-note-data';
import { notePages } from './brokerage-note-layouts';
import { buildImagePdf, buildMultiPagePdf, PdfLine } from './pdf-writer';
import { Raster } from './png-writer';
import { Color, createRaster, drawText } from './raster';
import {
    SYNTHETIC_ACCOUNT,
    SYNTHETIC_BROKER,
    SYNTHETIC_CLIENT_CODE,
    SYNTHETIC_HOLDER_CPF,
    SYNTHETIC_HOLDER_NAME
} from './synthetic-identity';

const PAGE_WIDTH: number = 842;
const PAGE_HEIGHT: number = 595;
const SCAN_FACTOR: number = 2;
const GLYPH_SCALE: number = 2;
const SCAN_PAPER: Color = [244, 243, 238];
const SCAN_INK: Color = [24, 24, 30];
const NOTES_DIR: string = 'notes';

export const NOTE_EVAL_CASES_DIR: string = 'investment_extract';
export const NOTE_FIXTURES_PATH: string = 'test/fixtures/investment-import/generated/notes';
const PERSONAL_DATA: readonly string[] = [SYNTHETIC_HOLDER_NAME, SYNTHETIC_HOLDER_CPF, SYNTHETIC_CLIENT_CODE, SYNTHETIC_ACCOUNT];

interface ExpectedLine {
    readonly ticker: string;
    readonly kind: 'buy' | 'sell';
    readonly quantity: string;
    readonly unitPrice: string;
    readonly grossMinor: number;
    readonly feesMinor: number;
    readonly check?: string;
}

function decimal(cents: number): string {
    return (cents / 100).toFixed(2);
}

function scanned(pages: readonly (readonly PdfLine[])[]): Buffer {
    const page: readonly PdfLine[] = pages[0] ?? [];
    const raster: Raster = createRaster(PAGE_WIDTH * SCAN_FACTOR, PAGE_HEIGHT * SCAN_FACTOR, SCAN_PAPER);
    page.forEach((line: PdfLine): void => {
        const x: number = line.x * SCAN_FACTOR;
        const top: number = (PAGE_HEIGHT - line.y) * SCAN_FACTOR - 14;
        drawText(raster, line.text, x, top, GLYPH_SCALE, SCAN_INK);
        if (line.bold) {
            drawText(raster, line.text, x + 1, top, GLYPH_SCALE, SCAN_INK);
        }
    });
    return buildImagePdf({ width: raster.width, height: raster.height, rgb: raster.data });
}

function pagesOf(document: NoteDocument): PdfLine[][] {
    return document.notes.flatMap((note: NoteSpec): PdfLine[][] => notePages(document.layout, note, document.poisoned === true));
}

function pdfOf(document: NoteDocument): Buffer {
    const pages: PdfLine[][] = pagesOf(document);
    return document.layout === 'scanned' ? scanned(pages) : buildMultiPagePdf(pages);
}

export function buildBrokerageNotes(): [string, Buffer][] {
    return NOTE_DOCUMENTS.map((document: NoteDocument): [string, Buffer] => [`${NOTES_DIR}/${document.id}.pdf`, pdfOf(document)]);
}

function apportion(total: number, weights: readonly number[]): number[] {
    const sum: number = weights.reduce((left: number, right: number): number => left + right, 0);
    const exact: number[] = weights.map((weight: number): number => (total * weight) / sum);
    const shares: number[] = exact.map((value: number): number => Math.floor(value));
    const missing: number = total - shares.reduce((left: number, right: number): number => left + right, 0);
    exact
        .map((value: number, index: number): { readonly index: number; readonly fraction: number } => ({
            index,
            fraction: value - Math.floor(value)
        }))
        .sort((left, right): number => right.fraction - left.fraction || left.index - right.index)
        .slice(0, missing)
        .forEach((item): void => {
            shares[item.index] = (shares[item.index] ?? 0) + 1;
        });
    return shares;
}

function costsOf(fees: NoteFees): number {
    return fees.settlementCents + fees.exchangeCents + fees.brokerageCents + fees.issCents;
}

function answerTrade(trade: NoteTrade): Record<string, unknown> {
    return {
        side: trade.side,
        code: trade.printedCode,
        securitySpec: trade.spec,
        market: trade.market,
        quantity: String(trade.quantity),
        unitPrice: decimal(trade.priceCents),
        grossMinor: grossCentsOf(trade),
        dayTrade: trade.dayTrade === true ? true : null
    };
}

function answerNote(note: NoteSpec): Record<string, unknown> {
    const totals: NoteTotals = totalsOf(note);
    return {
        number: note.number,
        tradeDate: note.date,
        broker: SYNTHETIC_BROKER,
        trades: note.trades.map(answerTrade),
        operationsTotalMinor: note.printedTotalCents ?? totals.volumeCents,
        netMinor: totals.netCents,
        fees: {
            settlementMinor: totals.fees.settlementCents,
            exchangeMinor: totals.fees.exchangeCents,
            brokerageMinor: totals.fees.brokerageCents,
            issMinor: totals.fees.issCents,
            irrfMinor: totals.fees.irrfCents,
            otherMinor: 0
        }
    };
}

function expectedLines(note: NoteSpec): ExpectedLine[] {
    const totals: NoteTotals = totalsOf(note);
    const shares: number[] = apportion(costsOf(totals.fees), note.trades.map(grossCentsOf));
    const totalWrong: boolean = note.printedTotalCents !== undefined && note.printedTotalCents !== totals.volumeCents;
    return note.trades.flatMap((trade: NoteTrade, index: number): ExpectedLine[] =>
        trade.market === OPTION_MARKET || trade.ticker === null
            ? []
            : [
                  {
                      ticker: trade.ticker,
                      kind: trade.side,
                      quantity: String(trade.quantity),
                      unitPrice: decimal(trade.priceCents),
                      grossMinor: grossCentsOf(trade),
                      feesMinor: shares[index] ?? 0,
                      ...(totalWrong ? { check: 'total_mismatch' } : {})
                  }
              ]
    );
}

function expectedIgnored(note: NoteSpec): Record<string, string>[] {
    return note.trades
        .filter((trade: NoteTrade): boolean => trade.market === OPTION_MARKET)
        .map((trade: NoteTrade): Record<string, string> => ({ description: trade.spec, reason: 'unsupported_market' }));
}

function evalCaseOf(document: NoteDocument): Record<string, unknown> {
    const mismatches: number = document.notes.filter(
        (note: NoteSpec): boolean => note.printedTotalCents !== undefined && note.printedTotalCents !== totalsOf(note).volumeCents
    ).length;
    return {
        id: document.id,
        description: document.description,
        file: `${NOTE_FIXTURES_PATH}/${document.id}.pdf`,
        input: document.layout === 'scanned' ? 'image' : 'text',
        personalData: PERSONAL_DATA,
        modelAnswer: { documentType: 'note', currency: 'BRL', totalMinor: null, operations: [], notes: document.notes.map(answerNote) },
        expected: {
            lines: document.notes.flatMap(expectedLines),
            ignored: document.notes.flatMap(expectedIgnored),
            notes: mismatches > 0 ? [{ code: 'note_total_mismatch', count: mismatches }] : []
        }
    };
}

export function buildNoteEvalCases(): [string, Buffer][] {
    return NOTE_DOCUMENTS.map((document: NoteDocument): [string, Buffer] => [
        `${NOTE_EVAL_CASES_DIR}/${document.id}.json`,
        Buffer.from(`${JSON.stringify(evalCaseOf(document), null, 2)}\n`, 'utf8')
    ]);
}

export function buildNoteCatalogFile(): [string, Buffer] {
    return [`${NOTE_EVAL_CASES_DIR}/catalog.json`, Buffer.from(`${JSON.stringify(NOTE_CATALOG, null, 2)}\n`, 'utf8')];
}
