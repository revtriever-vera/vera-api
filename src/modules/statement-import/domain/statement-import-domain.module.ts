import { Module } from '@nestjs/common';
import { StatementImportRepositoryModule } from '../repositories/statement-import-repository.module';
import { StatementImportPreviewDomain } from './statement-import-preview.domain';

@Module({
    imports: [StatementImportRepositoryModule],
    providers: [StatementImportPreviewDomain],
    exports: [StatementImportPreviewDomain]
})
export class StatementImportDomainModule {}
