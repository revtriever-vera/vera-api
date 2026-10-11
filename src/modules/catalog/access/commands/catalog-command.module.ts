import { Module } from '@nestjs/common';
import { CatalogApplicationModule } from '../../application/catalog-application.module';
import { CatalogSyncTesouroDailyCommand, CatalogSyncTickHandler, CatalogSyncWeeklyCommand } from './catalog-sync.command';

@Module({
    imports: [CatalogApplicationModule],
    providers: [CatalogSyncWeeklyCommand, CatalogSyncTesouroDailyCommand, CatalogSyncTickHandler]
})
export class CatalogCommandModule {}
