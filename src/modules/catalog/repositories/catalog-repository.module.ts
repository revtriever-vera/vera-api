import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { AssetsRepository } from './assets.repository';
import { CatalogSyncRunsRepository } from './catalog-sync-runs.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [AssetsRepository, CatalogSyncRunsRepository],
    exports: [AssetsRepository, CatalogSyncRunsRepository]
})
export class CatalogRepositoryModule {}
