import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { ThrottleModule } from '../../../../core/throttle/throttle.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { IntegrationCredentialsApplicationModule } from '../../application/integration-credentials-application.module';
import { IntegrationsController } from './integrations.controller';

@Module({
    imports: [IntegrationCredentialsApplicationModule, IdentityApplicationModule, ThrottleModule, ContextModule],
    controllers: [IntegrationsController]
})
export class IntegrationCredentialsHttpModule {}
