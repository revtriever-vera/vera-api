import { extractText, getDocumentProxy } from 'unpdf';
import { PDFDocument } from 'pdf-lib';
import { FileTooManyPagesError, FileUnreadableError } from './investment-import.errors';
import { DeadlineExceededError, withTimeout } from './model/with-timeout';

export const MAX_PDF_PAGES: number = 50;
export const MAX_SCANNED_PAGES: number = 10;
export const PDF_TIMEOUT_MS: number = 5000;
export const MAX_PDF_TEXT_CHARS: number = 400_000;
const MIN_TEXT_CHARS_PER_PAGE: number = 40;
const WHITESPACE: RegExp = /\s/g;

export interface PdfContent {
    readonly pageCount: number;
    readonly pages: readonly string[];
    readonly hasTextLayer: boolean;
}

type PdfDocument = Awaited<ReturnType<typeof getDocumentProxy>>;

function failureOf(error: unknown): FileUnreadableError {
    return new FileUnreadableError(error instanceof DeadlineExceededError ? 'timeout' : 'corrupt');
}

function hasTextLayer(pages: readonly string[]): boolean {
    const letters: number = pages.reduce((total: number, page: string): number => total + page.replace(WHITESPACE, '').length, 0);
    return pages.length > 0 && letters >= pages.length * MIN_TEXT_CHARS_PER_PAGE;
}

async function extract(document: PdfDocument): Promise<readonly string[]> {
    const result: { readonly text: string[] } = await extractText(document, { mergePages: false });
    const chars: number = result.text.reduce((total: number, page: string): number => total + page.length, 0);
    if (chars > MAX_PDF_TEXT_CHARS) {
        throw new FileUnreadableError('too_much_text');
    }
    return result.text;
}

async function readWithin(bytes: Uint8Array, document: { current: PdfDocument | null }): Promise<PdfContent> {
    document.current = await getDocumentProxy(new Uint8Array(bytes));
    if (document.current.numPages > MAX_PDF_PAGES) {
        throw new FileTooManyPagesError(MAX_PDF_PAGES);
    }
    const pages: readonly string[] = await extract(document.current);
    return { pageCount: document.current.numPages, pages, hasTextLayer: hasTextLayer(pages) };
}

export async function readPdfContent(bytes: Uint8Array): Promise<PdfContent> {
    const document: { current: PdfDocument | null } = { current: null };
    try {
        return await withTimeout(readWithin(bytes, document), PDF_TIMEOUT_MS);
    } catch (error: unknown) {
        if (error instanceof FileTooManyPagesError || error instanceof FileUnreadableError) {
            throw error;
        }
        throw failureOf(error);
    } finally {
        await document.current?.loadingTask.destroy().catch((): void => undefined);
    }
}

async function pageOf(source: PDFDocument, index: number): Promise<Uint8Array> {
    const single: PDFDocument = await PDFDocument.create();
    const [page] = await single.copyPages(source, [index]);
    if (page !== undefined) {
        single.addPage(page);
    }
    return single.save();
}

async function splitAll(bytes: Uint8Array, count: number): Promise<Uint8Array[]> {
    const source: PDFDocument = await PDFDocument.load(bytes, { updateMetadata: false });
    const pages: Uint8Array[] = [];
    for (let index: number = 0; index < Math.min(count, source.getPageCount()); index += 1) {
        pages.push(await pageOf(source, index));
    }
    return pages;
}

export async function splitPdfPages(bytes: Uint8Array, count: number): Promise<Uint8Array[]> {
    try {
        return await withTimeout(splitAll(bytes, count), PDF_TIMEOUT_MS);
    } catch (error: unknown) {
        throw failureOf(error);
    }
}
