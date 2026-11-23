import { Module } from '@nestjs/common';
import { IntegrationCredentialsRepositoryModule } from '../repositories/integration-credentials-repository.module';
import { IntegrationCredentialsDomain } from './integration-credentials.domain';

@Module({
    imports: [IntegrationCredentialsRepositoryModule],
    providers: [IntegrationCredentialsDomain],
    exports: [IntegrationCredentialsDomain]
})
export class IntegrationCredentialsDomainModule {}
