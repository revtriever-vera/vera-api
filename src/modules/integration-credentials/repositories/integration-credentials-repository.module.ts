import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { IntegrationCredentialsRepository } from './integration-credentials.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [IntegrationCredentialsRepository],
    exports: [IntegrationCredentialsRepository]
})
export class IntegrationCredentialsRepositoryModule {}
