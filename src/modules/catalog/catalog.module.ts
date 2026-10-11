import { Module } from '@nestjs/common';
import { CatalogCommandModule } from './access/commands/catalog-command.module';
import { CatalogHttpModule } from './access/http/catalog-http.module';
import { CatalogQueueModule } from './access/queue/catalog-queue.module';

@Module({
    imports: [CatalogHttpModule, CatalogCommandModule, CatalogQueueModule]
})
export class CatalogModule {}
