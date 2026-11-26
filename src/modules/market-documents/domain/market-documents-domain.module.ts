import { Module } from '@nestjs/common';
import { MarketDocumentsRepositoryModule } from '../repositories/market-documents-repository.module';
import { MarketDocumentDomain } from './market-document.domain';

@Module({
    imports: [MarketDocumentsRepositoryModule],
    providers: [MarketDocumentDomain],
    exports: [MarketDocumentDomain]
})
export class MarketDocumentsDomainModule {}
