import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { setTimeout as sleep } from 'node:timers/promises';
import { DateUtil } from '../../../shared/utils/date.util';
import { ProviderHttpService } from '../../market-data/services/provider-http.service';
import { marketDocumentsConfig } from '../config/market-documents.config';
import {
    DOCUMENT_CATEGORIES,
    DOCUMENT_SOURCES,
    DOCUMENT_STATUSES,
    DocumentCategory,
    DocumentDraft,
    DocumentIssuer,
    DocumentSource,
    SKIP_REASONS
} from '../domain/market-documents.types';
import { MarketDocumentSourcePort } from '../ports/market-document-source.port';
import { FnetDocumentItem, deliveryInstant, fnetListSchema } from '../validation/fnet.schemas';

const LIST_PAGE_SIZE: number = 60;
const ACTIVE_STATUS: string = 'AC';

const CATEGORY_PATTERNS: ReadonlyArray<readonly [RegExp, DocumentCategory]> = [
    [/informe\s+mensal/i, DOCUMENT_CATEGORIES.monthlyReport],
    [/relat[oó]rio\s+gerencial/i, DOCUMENT_CATEGORIES.managementReport],
    [/fato\s+relevante/i, DOCUMENT_CATEGORIES.relevantFact]
];

function categoryOf(item: FnetDocumentItem): DocumentCategory | null {
    const text: string = `${item.categoriaDocumento} ${item.tipoDocumento}`;
    return CATEGORY_PATTERNS.find(([pattern]: readonly [RegExp, DocumentCategory]): boolean => pattern.test(text))?.[1] ?? null;
}

function brazilianDate(isoDate: string): string {
    const [year, month, day]: string[] = isoDate.split('-');
    return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

@Injectable()
export class FnetFiiDocumentsDriver extends MarketDocumentSourcePort {
    public readonly source: DocumentSource = DOCUMENT_SOURCES.b3Fnet;
    private lastRequestAt: number = 0;

    public constructor(
        @Inject(marketDocumentsConfig.KEY) private readonly config: ConfigType<typeof marketDocumentsConfig>,
        private readonly http: ProviderHttpService
    ) {
        super();
    }

    public handles(issuer: DocumentIssuer): boolean {
        return issuer.issuerKind === 'fund';
    }

    public async fetchFor(issuer: DocumentIssuer): Promise<readonly DocumentDraft[]> {
        const since: string = DateUtil.onlyDateString(DateUtil.addDays(new Date(), -this.config.MARKET_DOC_LOOKBACK_DAYS));
        const query: URLSearchParams = new URLSearchParams({
            d: '0',
            s: '0',
            l: String(LIST_PAGE_SIZE),
            cnpjFundo: issuer.cnpj,
            dataInicial: brazilianDate(since)
        });
        const base: string = this.config.MARKET_DOC_FNET_BASE_URL;
        await this.pace();
        const payload: unknown = await this.http.getJson({
            url: `${base}/pesquisarGerenciadorDocumentosDados?${query.toString()}`,
            headers: { 'User-Agent': this.config.MARKET_DOC_USER_AGENT, Accept: 'application/json' },
            timeoutMs: this.config.MARKET_DOC_HTTP_TIMEOUT_MS
        });
        return fnetListSchema.parse(payload).data.flatMap((item: FnetDocumentItem): DocumentDraft[] => {
            const draft: DocumentDraft | null = this.draftOf(item, base);
            return draft === null ? [] : [draft];
        });
    }

    private draftOf(item: FnetDocumentItem, base: string): DocumentDraft | null {
        const category: DocumentCategory | null = categoryOf(item);
        const publishedAt: string | null = deliveryInstant(item.dataEntrega);
        if (item.status !== ACTIVE_STATUS || category === null || publishedAt === null) {
            return null;
        }
        return {
            externalId: String(item.id),
            category,
            title: item.tipoDocumento === '' ? item.categoriaDocumento : item.tipoDocumento,
            publishedAt,
            url: `${base}/exibirDocumento?id=${String(item.id)}&cvm=true`,
            status: DOCUMENT_STATUSES.skipped,
            skipReason: SKIP_REASONS.linkOnly
        };
    }

    private async pace(): Promise<void> {
        const wait: number = this.lastRequestAt + this.config.MARKET_DOC_REQUEST_SPACING_MS - Date.now();
        if (this.lastRequestAt > 0 && wait > 0) {
            await sleep(wait);
        }
        this.lastRequestAt = Date.now();
    }
}
