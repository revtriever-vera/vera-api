import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { MarketDocumentSummariesRepository } from './market-document-summaries.repository';
import { MarketDocumentsRepository } from './market-documents.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [MarketDocumentsRepository, MarketDocumentSummariesRepository],
    exports: [MarketDocumentsRepository, MarketDocumentSummariesRepository]
})
export class MarketDocumentsRepositoryModule {}
