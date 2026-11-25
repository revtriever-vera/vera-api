import { deflateSync } from 'node:zlib';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { FileTooManyPagesError, FileUnreadableError } from './investment-import.errors';
import { MAX_PDF_PAGES, PdfContent, readPdfContent, splitPdfPages } from './pdf-text';

const BODY: string = 'Bovespa C VISTA PETROBRAS PN N2 PETR4 100 38,50 3.850,00 D e mais algum texto da nota';

async function pdfOf(pages: number, text: string | null): Promise<Uint8Array> {
    const document: PDFDocument = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    for (let index: number = 0; index < pages; index += 1) {
        const page = document.addPage([595, 842]);
        if (text !== null) {
            page.drawText(text, { x: 20, y: 800, size: 10, font });
        }
    }
    return document.save();
}

describe('readPdfContent', () => {
    it('extrai o texto de cada página e reconhece a camada de texto', async () => {
        const content: PdfContent = await readPdfContent(await pdfOf(2, BODY));

        expect(content.pageCount).toBe(2);
        expect(content.hasTextLayer).toBe(true);
        expect(content.pages[0]).toContain('PETR4 100 38,50');
    });

    it('PDF sem texto (escaneado) volta sem camada de texto', async () => {
        const content: PdfContent = await readPdfContent(await pdfOf(3, null));

        expect(content.pageCount).toBe(3);
        expect(content.hasTextLayer).toBe(false);
    });

    it('acima de 50 páginas é recusado antes de ler o texto', async () => {
        await expect(readPdfContent(await pdfOf(MAX_PDF_PAGES + 1, BODY))).rejects.toBeInstanceOf(FileTooManyPagesError);
    });

    it('arquivo que começa como PDF mas está corrompido é recusado', async () => {
        const broken: Uint8Array = new TextEncoder().encode(
            '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF'
        );

        await expect(readPdfContent(broken)).rejects.toBeInstanceOf(FileUnreadableError);
    });

    it('bomba de descompressão não trava: devolve erro de arquivo ilegível ou termina', async () => {
        const bomb: Uint8Array = bombPdf();

        const outcome: unknown = await readPdfContent(bomb).catch((error: unknown): unknown => error);

        expect(outcome instanceof FileUnreadableError || (outcome as PdfContent).pageCount === 1).toBe(true);
    }, 15_000);

    it('texto gigante é recusado pelo limite de texto', async () => {
        const outcome: unknown = await readPdfContent(await heavyTextPdf()).catch((error: unknown): unknown => error);

        expect(outcome).toBeInstanceOf(FileUnreadableError);
        expect((outcome as FileUnreadableError).meta).toMatchObject({ reason: expect.stringMatching(/too_much_text|timeout/) });
    }, 15_000);
});

describe('splitPdfPages', () => {
    it('devolve uma página por arquivo', async () => {
        const pages: Uint8Array[] = await splitPdfPages(await pdfOf(4, BODY), 3);

        expect(pages).toHaveLength(3);
        for (const page of pages) {
            expect((await readPdfContent(page)).pageCount).toBe(1);
        }
    });

    it('PDF corrompido é arquivo ilegível', async () => {
        await expect(splitPdfPages(new TextEncoder().encode('%PDF-1.4 lixo'), 1)).rejects.toBeInstanceOf(FileUnreadableError);
    });
});

async function heavyTextPdf(): Promise<Uint8Array> {
    const document: PDFDocument = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    const line: string = 'A'.repeat(200);
    const rows: number[] = Array.from({ length: 3000 }, (_value: unknown, row: number): number => row);
    rows.forEach((row: number): void => {
        const page = row % 300 === 0 ? document.addPage([595, 842]) : document.getPages()[document.getPageCount() - 1];
        page?.drawText(line, { x: 1, y: row % 300, size: 1, font });
    });
    return document.save();
}

function bombPdf(): Uint8Array {
    const inflated: Buffer = Buffer.alloc(60 * 1024 * 1024, 0x20);
    const packed: Buffer = deflateSync(inflated, { level: 9 });
    const head: string = [
        '%PDF-1.4',
        '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
        '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
        '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >> endobj',
        `4 0 obj << /Length ${String(packed.length)} /Filter /FlateDecode >>`,
        'stream\n'
    ].join('\n');
    return new Uint8Array(
        Buffer.concat([Buffer.from(head, 'latin1'), packed, Buffer.from('\nendstream endobj\ntrailer << /Root 1 0 R >>\n%%EOF', 'latin1')])
    );
}
