import { Module } from '@nestjs/common';
import { PortfolioEventsRepositoryModule } from '../repositories/portfolio-events-repository.module';
import { AssetIssuerLinkDomain } from './asset-issuer-link.domain';
import { PortfolioEventDomain } from './portfolio-event.domain';

@Module({
    imports: [PortfolioEventsRepositoryModule],
    providers: [AssetIssuerLinkDomain, PortfolioEventDomain],
    exports: [AssetIssuerLinkDomain, PortfolioEventDomain]
})
export class PortfolioEventsDomainModule {}
