import { Module } from '@nestjs/common';
import { MarketDocumentsRepositoryModule } from '../repositories/market-documents-repository.module';
import { MarketDocumentSummaryDomain } from './market-document-summary.domain';
import { MarketDocumentDomain } from './market-document.domain';

@Module({
    imports: [MarketDocumentsRepositoryModule],
    providers: [MarketDocumentDomain, MarketDocumentSummaryDomain],
    exports: [MarketDocumentDomain, MarketDocumentSummaryDomain]
})
export class MarketDocumentsDomainModule {}
