import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { PortfolioApplicationModule } from '../../application/portfolio-application.module';
import { PortfolioController } from './portfolio.controller';

@Module({
    imports: [PortfolioApplicationModule, IdentityApplicationModule, ContextModule],
    controllers: [PortfolioController]
})
export class PortfolioHttpModule {}
