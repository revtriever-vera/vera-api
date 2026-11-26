import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { DateUtil } from '../../../shared/utils/date.util';
import { CvmIpeReaderService, IpeDocument } from '../../catalog/services/cvm-ipe-reader.service';
import { marketDocumentsConfig } from '../config/market-documents.config';
import { isRoutineCategory } from '../domain/routine-categories';
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

const CATEGORY_BY_IPE: Readonly<Record<string, DocumentCategory>> = {
    'Fato Relevante': DOCUMENT_CATEGORIES.relevantFact,
    'Comunicado ao Mercado': DOCUMENT_CATEGORIES.marketNotice,
    'Aviso aos Acionistas': DOCUMENT_CATEGORIES.shareholderNotice
};

function titleOf(document: IpeDocument): string {
    return [document.subject, document.type, document.category].find((part: string): boolean => part !== '') ?? document.category;
}

function draftOf(document: IpeDocument): DocumentDraft | null {
    const category: DocumentCategory | undefined = CATEGORY_BY_IPE[document.category];
    const routine: boolean = category === undefined && isRoutineCategory(document.category);
    if (category === undefined && !routine) {
        return null;
    }
    return {
        externalId: `${String(document.sequence)}:${String(document.version)}`,
        category: category ?? DOCUMENT_CATEGORIES.routine,
        title: titleOf(document),
        publishedAt: `${document.deliveryDate}T12:00:00Z`,
        url: document.url,
        status: routine ? DOCUMENT_STATUSES.skipped : DOCUMENT_STATUSES.pending,
        skipReason: routine ? SKIP_REASONS.routineCategory : null
    };
}

@Injectable()
export class CvmIpeDocumentsDriver extends MarketDocumentSourcePort {
    public readonly source: DocumentSource = DOCUMENT_SOURCES.cvmIpe;

    public constructor(
        @Inject(marketDocumentsConfig.KEY) private readonly config: ConfigType<typeof marketDocumentsConfig>,
        private readonly ipe: CvmIpeReaderService
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
        const documents: readonly IpeDocument[] = await this.ipe.documents({ today, deliveredSince: since });
        return documents
            .filter((document: IpeDocument): boolean => document.cnpj === issuer.cnpj && document.deliveryDate >= since)
            .flatMap((document: IpeDocument): DocumentDraft[] => {
                const draft: DocumentDraft | null = draftOf(document);
                return draft === null ? [] : [draft];
            });
    }
}
