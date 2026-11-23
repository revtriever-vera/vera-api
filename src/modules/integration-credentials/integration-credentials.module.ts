import { Module } from '@nestjs/common';
import { IntegrationCredentialsHttpModule } from './access/http/integration-credentials-http.module';

@Module({
    imports: [IntegrationCredentialsHttpModule]
})
export class IntegrationCredentialsModule {}
