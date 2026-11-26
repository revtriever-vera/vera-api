import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { DateUtil } from '../../../shared/utils/date.util';
import { CvmPeriodicReaderService, PERIODIC_KIND_LIST, PeriodicDocument } from '../../catalog/services/cvm-periodic-reader.service';
import { marketDocumentsConfig } from '../config/market-documents.config';
import {
    DOCUMENT_CATEGORIES,
    DOCUMENT_SOURCES,
    DOCUMENT_STATUSES,
    DocumentDraft,
    DocumentIssuer,
    DocumentSource,
    SKIP_REASONS
} from '../domain/market-documents.types';
import { MarketDocumentSourcePort } from '../ports/market-document-source.port';

function draftOf(document: PeriodicDocument): DocumentDraft {
    return {
        externalId: `${document.kind}:${document.documentId}`,
        category: document.kind === 'ITR' ? DOCUMENT_CATEGORIES.quarterlyResults : DOCUMENT_CATEGORIES.annualResults,
        title: `${document.kind} ${document.referenceDate}`,
        publishedAt: `${document.deliveryDate}T12:00:00Z`,
        url: document.url,
        status: DOCUMENT_STATUSES.skipped,
        skipReason: SKIP_REASONS.financialPackage
    };
}

@Injectable()
export class CvmItrDfpDriver extends MarketDocumentSourcePort {
    public readonly source: DocumentSource = DOCUMENT_SOURCES.cvmItr;

    public constructor(
        @Inject(marketDocumentsConfig.KEY) private readonly config: ConfigType<typeof marketDocumentsConfig>,
        private readonly periodic: CvmPeriodicReaderService
    ) {
        super();
    }

    public handles(issuer: DocumentIssuer): boolean {
        return issuer.issuerKind === 'company';
    }

    public async fetchFor(issuer: DocumentIssuer): Promise<readonly DocumentDraft[]> {
        const today: string = DateUtil.todayInBrazil();
        const since: string = DateUtil.onlyDateString(
            DateUtil.addDays(new Date(`${today}T12:00:00Z`), -this.config.MARKET_DOC_LOOKBACK_DAYS)
        );
        const documents: PeriodicDocument[] = [];
        for (const kind of PERIODIC_KIND_LIST) {
            documents.push(...(await this.periodic.documents(kind, { today, deliveredSince: since })));
        }
        return documents.filter((document: PeriodicDocument): boolean => document.cnpj === issuer.cnpj).map(draftOf);
    }
}
