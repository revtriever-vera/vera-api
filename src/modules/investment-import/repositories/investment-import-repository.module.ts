import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { InvestmentImportPreviewsRepository } from './investment-import-previews.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [InvestmentImportPreviewsRepository],
    exports: [InvestmentImportPreviewsRepository]
})
export class InvestmentImportRepositoryModule {}
