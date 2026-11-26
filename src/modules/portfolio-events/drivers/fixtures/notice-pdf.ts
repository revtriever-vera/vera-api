import { PDFDocument, PDFFont, PDFPage, StandardFonts } from 'pdf-lib';

const FONT_SIZE: number = 8;
const LINE_HEIGHT: number = 10;
const MARGIN: number = 30;
const LINES_PER_PAGE: number = 60;
const PAGE_SIZE: [number, number] = [1400, 700];

export async function pdfOfText(text: string): Promise<Uint8Array> {
    const document: PDFDocument = await PDFDocument.create();
    const font: PDFFont = await document.embedFont(StandardFonts.Helvetica);
    const lines: string[] = text.split('\n');
    for (let from: number = 0; from < lines.length; from += LINES_PER_PAGE) {
        const page: PDFPage = document.addPage(PAGE_SIZE);
        lines.slice(from, from + LINES_PER_PAGE).forEach((line: string, row: number): void => {
            page.drawText(line, { x: MARGIN, y: PAGE_SIZE[1] - MARGIN - row * LINE_HEIGHT, size: FONT_SIZE, font });
        });
    }
    return document.save();
}
