import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { PortfolioWatchApplicationModule } from '../../application/portfolio-watch-application.module';
import { PortfolioWatchController } from './portfolio-watch.controller';

@Module({
    imports: [PortfolioWatchApplicationModule, IdentityApplicationModule, ContextModule],
    controllers: [PortfolioWatchController]
})
export class PortfolioWatchHttpModule {}
