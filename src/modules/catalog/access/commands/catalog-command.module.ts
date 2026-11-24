import { Module } from '@nestjs/common';
import { CatalogApplicationModule } from '../../application/catalog-application.module';
import {
    CatalogSyncCvmFundsDailyCommand,
    CatalogSyncTesouroDailyCommand,
    CatalogSyncTickHandler,
    CatalogSyncWeeklyCommand
} from './catalog-sync.command';

@Module({
    imports: [CatalogApplicationModule],
    providers: [CatalogSyncWeeklyCommand, CatalogSyncTesouroDailyCommand, CatalogSyncCvmFundsDailyCommand, CatalogSyncTickHandler]
})
export class CatalogCommandModule {}
