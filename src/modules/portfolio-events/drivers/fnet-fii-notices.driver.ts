import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { setTimeout as sleep } from 'node:timers/promises';
import { DateUtil } from '../../../shared/utils/date.util';
import { ProviderHttpService } from '../../market-data/services/provider-http.service';
import { portfolioEventsConfig } from '../config/portfolio-events.config';
import { EVENT_SOURCES, EventSource, ISSUER_KINDS, IssuerLink, PortfolioEventDraft } from '../domain/portfolio-events.types';
import { PortfolioEventSourcePort } from '../ports/portfolio-event-source.port';
import { FnetListItem, fnetDocumentSchema, fnetListSchema } from '../validation/fnet.schemas';
import { decodeDocument, isStructuredActiveNotice, parseNoticeDocument } from './fnet-notice-parser';

const LIST_PAGE_SIZE: number = 40;

function brazilianDate(isoDate: string): string {
    const [year, month, day]: string[] = isoDate.split('-');
    return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

function newestPerKey(drafts: readonly PortfolioEventDraft[]): PortfolioEventDraft[] {
    return [
        ...new Map<string, PortfolioEventDraft>(
            drafts.map((draft: PortfolioEventDraft): [string, PortfolioEventDraft] => [draft.externalKey, draft])
        ).values()
    ];
}

@Injectable()
export class FnetFiiNoticesDriver extends PortfolioEventSourcePort {
    public readonly source: EventSource = EVENT_SOURCES.fnet;
    private lastRequestAt: number = 0;

    public constructor(
        @Inject(portfolioEventsConfig.KEY) private readonly config: ConfigType<typeof portfolioEventsConfig>,
        private readonly http: ProviderHttpService
    ) {
        super();
    }

    public handles(link: IssuerLink): boolean {
        return link.issuerKind === ISSUER_KINDS.fund;
    }

    public async fetchFor(link: IssuerLink): Promise<readonly PortfolioEventDraft[]> {
        const items: FnetListItem[] = (await this.listNotices(link.cnpj)).filter(isStructuredActiveNotice);
        const drafts: PortfolioEventDraft[] = [];
        for (const item of [...items].sort(
            (left: FnetListItem, right: FnetListItem): number => left.versao - right.versao || left.id - right.id
        )) {
            drafts.push(...(await this.readNotice(item.id, link.cnpj)));
        }
        return newestPerKey(drafts);
    }

    private async listNotices(cnpj: string): Promise<FnetListItem[]> {
        const since: string = DateUtil.onlyDateString(DateUtil.addDays(new Date(), -this.config.PORTFOLIO_EVENTS_LOOKBACK_DAYS));
        const query: URLSearchParams = new URLSearchParams({
            d: '0',
            s: '0',
            l: String(LIST_PAGE_SIZE),
            cnpjFundo: cnpj,
            dataInicial: brazilianDate(since)
        });
        const url: string = `${this.config.PORTFOLIO_EVENTS_FNET_BASE_URL}/pesquisarGerenciadorDocumentosDados?${query.toString()}`;
        return fnetListSchema.parse(await this.get(url)).data;
    }

    private async readNotice(id: number, cnpj: string): Promise<PortfolioEventDraft[]> {
        const base: string = this.config.PORTFOLIO_EVENTS_FNET_BASE_URL;
        const encoded: string = fnetDocumentSchema.parse(await this.get(`${base}/downloadDocumento?id=${String(id)}`));
        return parseNoticeDocument(decodeDocument(encoded), cnpj, `${base}/exibirDocumento?id=${String(id)}&cvm=true`);
    }

    private async get(url: string): Promise<unknown> {
        await this.pace();
        return this.http.getJson({
            url,
            headers: { 'User-Agent': this.config.PORTFOLIO_EVENTS_USER_AGENT, Accept: 'application/json' },
            timeoutMs: this.config.PORTFOLIO_EVENTS_HTTP_TIMEOUT_MS
        });
    }

    private async pace(): Promise<void> {
        const wait: number = this.lastRequestAt + this.config.PORTFOLIO_EVENTS_REQUEST_SPACING_MS - Date.now();
        if (this.lastRequestAt > 0 && wait > 0) {
            await sleep(wait);
        }
        this.lastRequestAt = Date.now();
    }
}
