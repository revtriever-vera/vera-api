import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { AppLocale } from '../../../shared/i18n/locale';
import { DateUtil } from '../../../shared/utils/date.util';
import { MarketDocumentsReaderService, PublicDocumentView } from '../../market-documents/services/market-documents-reader.service';
import { PortfolioSnapshot, PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { changeItemsOf } from '../domain/portfolio-changes';
import { ChangeItem, ChangeItemsQuery, ChangesFeed, ChangesQuery, HeldAsset } from '../domain/portfolio-changes.types';
import { heldAssetsOf } from './portfolio-changes-held-assets';

@Injectable()
export class PortfolioChangesReaderService {
    public constructor(
        private readonly portfolio: PortfolioSnapshotService,
        private readonly documents: MarketDocumentsReaderService,
        private readonly context: AppContext
    ) {}

    public async read(query: ChangesQuery, now: Date = new Date()): Promise<ChangesFeed> {
        const items: ChangeItem[] = await this.items(query, now);
        return { days: query.days, notice: this.documents.noticeOf(this.context.get().locale), items };
    }

    public async items(query: ChangeItemsQuery, now: Date = new Date()): Promise<ChangeItem[]> {
        const locale: AppLocale = this.context.get().locale;
        const snapshot: PortfolioSnapshot = await this.portfolio.build(query.holder);
        const held: Map<string, HeldAsset> = heldAssetsOf(snapshot, query.classId);
        const documents: PublicDocumentView[] = await this.documents.listForAssets(
            [...held.keys()],
            DateUtil.addDays(now, -query.days),
            locale
        );
        return changeItemsOf(documents, held, locale);
    }
}
