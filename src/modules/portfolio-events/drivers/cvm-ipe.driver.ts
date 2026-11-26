import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { setTimeout as sleep } from 'node:timers/promises';
import { DateUtil } from '../../../shared/utils/date.util';
import { CvmIpeReaderService, IpeDocument } from '../../catalog/services/cvm-ipe-reader.service';
import { ProviderHttpService } from '../../market-data/services/provider-http.service';
import { portfolioEventsConfig } from '../config/portfolio-events.config';
import { IncomeNotice, parseIncomeNotices } from '../domain/income-notice-parser';
import {
    EVENT_KINDS,
    EVENT_SOURCES,
    EventSource,
    ISSUER_KINDS,
    IssuerLink,
    PortfolioEventDraft,
    SHARE_CLASSES,
    ShareClass
} from '../domain/portfolio-events.types';
import { PortfolioEventSourcePort } from '../ports/portfolio-event-source.port';
import { PortfolioEventsMetricsService } from '../services/portfolio-events-metrics.service';
import { noticePdfText } from './notice-pdf-text';

const CATEGORY_NOTICE: string = 'Aviso aos Acionistas';
const CATEGORY_MARKET: string = 'Comunicado ao Mercado';
const CATEGORY_ASSEMBLY: string = 'Assembleia';
const SPECIES_CALL: string = 'Edital de Convocação';
const TYPE_ASSEMBLY_DATE: string = 'Data prevista para a assembleia';
const INCOME_SUBJECT: RegExp = /dividend|juros\s+sobre\s+(?:o\s+)?capital|\bJCP\b|provento/i;
const MAX_PDF_BYTES: number = 5_000_000;
const CVM_HOST_SUFFIX: string = '.cvm.gov.br';

function byNewest(left: IpeDocument, right: IpeDocument): number {
    return left.deliveryDate.localeCompare(right.deliveryDate) || left.version - right.version || left.sequence - right.sequence;
}

function isIncomeNotice(document: IpeDocument): boolean {
    const announcement: boolean = document.category === CATEGORY_NOTICE || document.category === CATEGORY_MARKET;
    return announcement && INCOME_SUBJECT.test(`${document.subject} ${document.type} ${document.species}`);
}

function isAssemblyDate(document: IpeDocument): boolean {
    return (
        (document.category === CATEGORY_ASSEMBLY && document.species === SPECIES_CALL) ||
        (document.category === CATEGORY_NOTICE && document.type === TYPE_ASSEMBLY_DATE)
    );
}

function isTrustedUrl(url: string): boolean {
    return URL.canParse(url) && new URL(url).protocol === 'https:' && new URL(url).hostname.endsWith(CVM_HOST_SUFFIX);
}

const ALL_CLASSES: string = 'ALL';

function noticeFor(notices: readonly IncomeNotice[], assetClass: ShareClass | null): IncomeNotice | null {
    const sameClass: IncomeNotice | undefined = notices.find((notice: IncomeNotice): boolean => notice.shareClass === assetClass);
    const shared: IncomeNotice | undefined = notices.find((notice: IncomeNotice): boolean => notice.shareClass === null);
    const preferredSeries: boolean = assetClass === SHARE_CLASSES.pna || assetClass === SHARE_CLASSES.pnb;
    const preferred: IncomeNotice | undefined = preferredSeries
        ? notices.find((notice: IncomeNotice): boolean => notice.shareClass === SHARE_CLASSES.pn)
        : undefined;
    return sameClass ?? shared ?? preferred ?? null;
}

function noticesFor(notices: readonly IncomeNotice[], assetClass: ShareClass | null): IncomeNotice[] {
    const declarations: Map<string, IncomeNotice[]> = new Map<string, IncomeNotice[]>();
    for (const notice of notices) {
        const key: string = `${notice.kind}:${notice.exDate}`;
        declarations.set(key, [...(declarations.get(key) ?? []), notice]);
    }
    return [...declarations.values()]
        .map((group: IncomeNotice[]): IncomeNotice | null => noticeFor(group, assetClass))
        .filter((notice: IncomeNotice | null): notice is IncomeNotice => notice !== null);
}

function incomeDraft(link: IssuerLink, notice: IncomeNotice, document: IpeDocument): PortfolioEventDraft {
    return {
        kind: notice.kind,
        exDate: notice.exDate,
        paymentDate: notice.paymentDate,
        eventDate: null,
        amountPerUnit: notice.amountPerUnit,
        currency: 'BRL',
        externalKey: `${link.cnpj}:${notice.kind}:${notice.exDate}:${link.assetClass ?? ALL_CLASSES}`,
        documentUrl: document.url
    };
}

function assemblyDraft(cnpj: string, document: IpeDocument): PortfolioEventDraft {
    return {
        kind: EVENT_KINDS.assembly,
        exDate: null,
        paymentDate: null,
        eventDate: document.referenceDate,
        amountPerUnit: null,
        currency: 'BRL',
        externalKey: `${cnpj}:${EVENT_KINDS.assembly}:${document.referenceDate}`,
        documentUrl: document.url
    };
}

@Injectable()
export class CvmIpeDriver extends PortfolioEventSourcePort {
    public readonly source: EventSource = EVENT_SOURCES.cvmIpe;
    private lastRequestAt: number = 0;

    public constructor(
        @Inject(portfolioEventsConfig.KEY) private readonly config: ConfigType<typeof portfolioEventsConfig>,
        private readonly ipe: CvmIpeReaderService,
        private readonly http: ProviderHttpService,
        private readonly metrics: PortfolioEventsMetricsService
    ) {
        super();
    }

    public handles(link: IssuerLink): boolean {
        return link.issuerKind === ISSUER_KINDS.company;
    }

    public async fetchFor(link: IssuerLink): Promise<readonly PortfolioEventDraft[]> {
        const today: string = DateUtil.todayInBrazil();
        const documents: IpeDocument[] = (await this.ipe.documents({ today, deliveredSince: this.since(today) })).filter(
            (document: IpeDocument): boolean => document.cnpj === link.cnpj
        );
        const assemblies: PortfolioEventDraft[] = documents
            .filter(isAssemblyDate)
            .sort(byNewest)
            .filter((document: IpeDocument): boolean => document.referenceDate >= this.since(today))
            .map((document: IpeDocument): PortfolioEventDraft => assemblyDraft(link.cnpj, document));
        const income: PortfolioEventDraft[] = await this.incomeOf(link, documents.filter(isIncomeNotice), today);
        return this.newestPerKey([...income, ...assemblies]);
    }

    private since(today: string): string {
        return DateUtil.onlyDateString(DateUtil.addDays(new Date(`${today}T12:00:00Z`), -this.config.PORTFOLIO_EVENTS_LOOKBACK_DAYS));
    }

    private async incomeOf(link: IssuerLink, notices: readonly IpeDocument[], today: string): Promise<PortfolioEventDraft[]> {
        const recent: IpeDocument[] = notices
            .filter((document: IpeDocument): boolean => document.deliveryDate >= this.since(today))
            .sort(byNewest)
            .slice(-this.config.PORTFOLIO_EVENTS_CVM_MAX_NOTICES);
        const drafts: PortfolioEventDraft[] = [];
        let unparsed: number = 0;
        for (const document of recent) {
            const found: IncomeNotice[] = noticesFor(await this.readNotices(document), link.assetClass);
            unparsed += found.length === 0 ? 1 : 0;
            drafts.push(...found.map((notice: IncomeNotice): PortfolioEventDraft => incomeDraft(link, notice, document)));
        }
        this.metrics.unparsed(this.source, unparsed);
        return drafts;
    }

    private async readNotices(document: IpeDocument): Promise<IncomeNotice[]> {
        if (!isTrustedUrl(document.url)) {
            return [];
        }
        try {
            await this.pace();
            const bytes: Uint8Array = await this.http.getBytes({
                url: document.url,
                headers: { 'User-Agent': this.config.PORTFOLIO_EVENTS_USER_AGENT },
                timeoutMs: this.config.PORTFOLIO_EVENTS_HTTP_TIMEOUT_MS,
                maxBytes: MAX_PDF_BYTES
            });
            const text: string | null = await noticePdfText(bytes);
            return text === null ? [] : parseIncomeNotices(text);
        } catch {
            this.metrics.sourceFailed(this.source, 'document_unreadable');
            return [];
        }
    }

    private newestPerKey(drafts: readonly PortfolioEventDraft[]): PortfolioEventDraft[] {
        return [
            ...new Map<string, PortfolioEventDraft>(
                drafts.map((draft: PortfolioEventDraft): [string, PortfolioEventDraft] => [draft.externalKey, draft])
            ).values()
        ];
    }

    private async pace(): Promise<void> {
        const wait: number = this.lastRequestAt + this.config.PORTFOLIO_EVENTS_CVM_REQUEST_SPACING_MS - Date.now();
        if (this.lastRequestAt > 0 && wait > 0) {
            await sleep(wait);
        }
        this.lastRequestAt = Date.now();
    }
}
