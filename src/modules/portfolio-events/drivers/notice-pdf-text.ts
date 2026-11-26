import { extractText, getDocumentProxy } from 'unpdf';

const MAX_PAGES: number = 8;
const MAX_CHARS: number = 60_000;

type PdfDocument = Awaited<ReturnType<typeof getDocumentProxy>>;

export async function noticePdfText(bytes: Uint8Array): Promise<string | null> {
    let document: PdfDocument | null = null;
    try {
        document = await getDocumentProxy(new Uint8Array(bytes));
        if (document.numPages > MAX_PAGES) {
            return null;
        }
        const { text }: { text: string[] } = await extractText(document, { mergePages: false });
        const joined: string = text.join('\n');
        return joined.length > MAX_CHARS ? null : joined;
    } catch {
        return null;
    } finally {
        await document?.loadingTask.destroy().catch((): void => undefined);
    }
}
