import { Module } from '@nestjs/common';
import { CatalogRepositoryModule } from '../repositories/catalog-repository.module';
import { AssetDomain } from './asset.domain';
import { CatalogSyncRunDomain } from './catalog-sync-run.domain';

@Module({
    imports: [CatalogRepositoryModule],
    providers: [AssetDomain, CatalogSyncRunDomain],
    exports: [AssetDomain, CatalogSyncRunDomain]
})
export class CatalogDomainModule {}
