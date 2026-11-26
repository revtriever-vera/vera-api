import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { setTimeout as sleep } from 'node:timers/promises';
import { extractText, getDocumentProxy } from 'unpdf';
import { HashUtil } from '../../../shared/utils/hash.util';
import { ProviderHttpService } from '../../market-data/services/provider-http.service';
import { marketDocumentsConfig } from '../config/market-documents.config';
import { SKIP_REASONS, SkipReason } from '../domain/market-documents.types';

export type TextOutcome =
    { readonly kind: 'text'; readonly text: string; readonly textHash: string } | { readonly kind: 'skipped'; readonly reason: SkipReason };

type PdfDocument = Awaited<ReturnType<typeof getDocumentProxy>>;

const TRUSTED_HOST_SUFFIX: string = '.cvm.gov.br';
const OVERSIZE_ERROR_MESSAGE: string = 'market-data.provider_format_invalid';
const PDF_SIGNATURE: string = '%PDF';

function isTrustedUrl(url: string): boolean {
    if (!URL.canParse(url)) {
        return false;
    }
    const parsed: URL = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith(TRUSTED_HOST_SUFFIX);
}

function isOversize(error: unknown): boolean {
    return error instanceof Error && error.name === 'ProviderError' && error.message === OVERSIZE_ERROR_MESSAGE;
}

function isPdf(bytes: Uint8Array): boolean {
    return new TextDecoder('latin1').decode(bytes.subarray(0, PDF_SIGNATURE.length)) === PDF_SIGNATURE;
}

@Injectable()
export class MarketDocumentTextService {
    private lastRequestAt: number = 0;

    public constructor(
        @Inject(marketDocumentsConfig.KEY) private readonly config: ConfigType<typeof marketDocumentsConfig>,
        private readonly http: ProviderHttpService
    ) {}

    public async read(url: string): Promise<TextOutcome> {
        if (!isTrustedUrl(url)) {
            return { kind: 'skipped', reason: SKIP_REASONS.untrustedUrl };
        }
        const bytes: Uint8Array | null = await this.download(url);
        if (bytes === null) {
            return { kind: 'skipped', reason: SKIP_REASONS.tooLarge };
        }
        if (!isPdf(bytes)) {
            return { kind: 'skipped', reason: SKIP_REASONS.notPdf };
        }
        return this.outcomeOf(await this.textOf(bytes));
    }

    private async download(url: string): Promise<Uint8Array | null> {
        await this.pace();
        try {
            return await this.http.getBytes({
                url,
                headers: { 'User-Agent': this.config.MARKET_DOC_USER_AGENT },
                timeoutMs: this.config.MARKET_DOC_HTTP_TIMEOUT_MS,
                maxBytes: this.config.MARKET_DOC_MAX_BYTES
            });
        } catch (error: unknown) {
            if (isOversize(error)) {
                return null;
            }
            throw error;
        }
    }

    private outcomeOf(text: string | null): TextOutcome {
        const trimmed: string = (text ?? '').trim();
        if (trimmed === '') {
            return { kind: 'skipped', reason: SKIP_REASONS.scanned };
        }
        const head: string = trimmed.slice(0, this.config.MARKET_DOC_MAX_CHARS);
        return { kind: 'text', text: head, textHash: HashUtil.sha256(head) };
    }

    private async textOf(bytes: Uint8Array): Promise<string | null> {
        let document: PdfDocument | null = null;
        try {
            document = await getDocumentProxy(new Uint8Array(bytes));
            const { text }: { text: string[] } = await extractText(document, { mergePages: false });
            return text.join('\n');
        } catch {
            return null;
        } finally {
            await document?.loadingTask.destroy().catch((): void => undefined);
        }
    }

    private async pace(): Promise<void> {
        const wait: number = this.lastRequestAt + this.config.MARKET_DOC_REQUEST_SPACING_MS - Date.now();
        if (this.lastRequestAt > 0 && wait > 0) {
            await sleep(wait);
        }
        this.lastRequestAt = Date.now();
    }
}
