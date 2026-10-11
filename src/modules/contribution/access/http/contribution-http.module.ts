import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { ThrottleModule } from '../../../../core/throttle/throttle.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { ContributionApplicationModule } from '../../application/contribution-application.module';
import { ContributionController } from './contribution.controller';

@Module({
    imports: [ContributionApplicationModule, IdentityApplicationModule, ThrottleModule, ContextModule],
    controllers: [ContributionController]
})
export class ContributionHttpModule {}
