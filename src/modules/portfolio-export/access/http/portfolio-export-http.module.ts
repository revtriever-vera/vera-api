import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { ThrottleModule } from '../../../../core/throttle/throttle.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { PortfolioExportApplicationModule } from '../../application/portfolio-export-application.module';
import { PortfolioExportController } from './portfolio-export.controller';

@Module({
    imports: [PortfolioExportApplicationModule, IdentityApplicationModule, ThrottleModule, ContextModule],
    controllers: [PortfolioExportController]
})
export class PortfolioExportHttpModule {}
