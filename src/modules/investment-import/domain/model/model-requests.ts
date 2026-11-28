import { LlmContentBlock, LlmGenerationResponse } from '../../../../core/llm/llm.types';
import { FileTooManyPagesError } from '../investment-import.errors';
import { MAX_SCANNED_PAGES, PdfContent, readPdfContent, splitPdfPages } from '../pdf-text';
import { PreparedImage, prepareImage } from './image-prepare';
import { MODEL_FILE_KINDS, ModelFileKind } from './model-file.types';

const TEXT_PAGE_LABEL: string = 'text';

export interface ModelRequest {
    readonly label: string;
    readonly content: readonly LlmContentBlock[];
}

export interface ModelPrompts {
    readonly textIntro: string;
    readonly imageIntro: string;
    readonly maskText: (page: string) => string;
}

export interface ModelDocument {
    readonly kind: ModelFileKind;
    readonly hasTextLayer: boolean;
    readonly requests: readonly ModelRequest[];
}

export interface ModelAnswers {
    readonly texts: string[];
    readonly labels: string[];
    readonly unread: string[];
    readonly costMicros: number;
}

function textRequestOf(content: PdfContent, prompts: ModelPrompts): ModelRequest[] {
    const text: string = content.pages
        .map((page: string, index: number): string => `--- page ${String(index + 1)} ---\n${prompts.maskText(page)}`)
        .join('\n');
    return [{ label: TEXT_PAGE_LABEL, content: [{ kind: 'text', text: `${prompts.textIntro}\n${text}` }] }];
}

async function scannedRequestsOf(bytes: Uint8Array, content: PdfContent, prompts: ModelPrompts): Promise<ModelRequest[]> {
    if (content.pageCount > MAX_SCANNED_PAGES) {
        throw new FileTooManyPagesError(MAX_SCANNED_PAGES);
    }
    const pages: Uint8Array[] = await splitPdfPages(bytes, content.pageCount);
    return pages.map((page: Uint8Array, index: number): ModelRequest => ({
        label: `p${String(index + 1)}`,
        content: [
            { kind: 'text', text: prompts.imageIntro },
            { kind: 'file', mediaType: 'application/pdf', data: page }
        ]
    }));
}

async function pdfDocumentOf(bytes: Uint8Array, prompts: ModelPrompts): Promise<ModelDocument> {
    const content: PdfContent = await readPdfContent(bytes);
    const requests: ModelRequest[] = content.hasTextLayer
        ? textRequestOf(content, prompts)
        : await scannedRequestsOf(bytes, content, prompts);
    return { kind: MODEL_FILE_KINDS.pdf, hasTextLayer: content.hasTextLayer, requests };
}

async function imageDocumentOf(bytes: Uint8Array, kind: ModelFileKind, prompts: ModelPrompts): Promise<ModelDocument> {
    const image: PreparedImage = await prepareImage(bytes, kind);
    const request: ModelRequest = {
        label: 'p1',
        content: [
            { kind: 'text', text: prompts.imageIntro },
            { kind: 'image', mediaType: image.mediaType, data: image.data }
        ]
    };
    return { kind, hasTextLayer: false, requests: [request] };
}

export async function modelDocumentOf(bytes: Uint8Array, kind: ModelFileKind, prompts: ModelPrompts): Promise<ModelDocument> {
    return kind === MODEL_FILE_KINDS.pdf ? pdfDocumentOf(bytes, prompts) : imageDocumentOf(bytes, kind, prompts);
}

export async function collectAnswers(
    requests: readonly ModelRequest[],
    capMicros: number,
    generate: (request: ModelRequest) => Promise<LlmGenerationResponse>
): Promise<ModelAnswers> {
    const answers: ModelAnswers = { texts: [], labels: [], unread: [], costMicros: 0 };
    let costMicros: number = 0;
    for (const request of requests) {
        if (costMicros >= capMicros) {
            answers.unread.push(request.label);
            continue;
        }
        const response: LlmGenerationResponse = await generate(request);
        costMicros += response.costMicros;
        answers.texts.push(response.text);
        answers.labels.push(request.label);
    }
    return { ...answers, costMicros };
}
