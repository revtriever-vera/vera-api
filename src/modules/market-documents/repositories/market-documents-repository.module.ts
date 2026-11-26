import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { MarketDocumentsRepository } from './market-documents.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [MarketDocumentsRepository],
    exports: [MarketDocumentsRepository]
})
export class MarketDocumentsRepositoryModule {}
