import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { AssetIssuerLinksRepository } from './asset-issuer-links.repository';
import { PortfolioEventsRepository } from './portfolio-events.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [AssetIssuerLinksRepository, PortfolioEventsRepository],
    exports: [AssetIssuerLinksRepository, PortfolioEventsRepository]
})
export class PortfolioEventsRepositoryModule {}
