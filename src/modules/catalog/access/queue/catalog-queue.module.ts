import { Module } from '@nestjs/common';
import { CatalogApplicationModule } from '../../application/catalog-application.module';
import { CatalogSyncSourceHandler } from './catalog-sync-source.handler';

@Module({
    imports: [CatalogApplicationModule],
    providers: [CatalogSyncSourceHandler]
})
export class CatalogQueueModule {}
