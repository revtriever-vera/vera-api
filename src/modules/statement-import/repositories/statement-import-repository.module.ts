import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { StatementImportPreviewsRepository } from './statement-import-previews.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [StatementImportPreviewsRepository],
    exports: [StatementImportPreviewsRepository]
})
export class StatementImportRepositoryModule {}
