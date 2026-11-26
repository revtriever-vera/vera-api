import { PDFDocument, PDFFont, PDFPage, StandardFonts } from 'pdf-lib';

const FONT_SIZE: number = 10;
const LINE_HEIGHT: number = 12;
const MARGIN: number = 30;
const PAGE_SIZE: [number, number] = [900, 700];

export async function pdfOfText(text: string): Promise<Uint8Array> {
    const document: PDFDocument = await PDFDocument.create();
    const font: PDFFont = await document.embedFont(StandardFonts.Helvetica);
    const page: PDFPage = document.addPage(PAGE_SIZE);
    text.split('\n').forEach((line: string, row: number): void => {
        page.drawText(line, { x: MARGIN, y: PAGE_SIZE[1] - MARGIN - row * LINE_HEIGHT, size: FONT_SIZE, font });
    });
    return document.save();
}

export async function blankPdf(): Promise<Uint8Array> {
    const document: PDFDocument = await PDFDocument.create();
    document.addPage(PAGE_SIZE);
    return document.save();
}
