import { Module } from '@nestjs/common';
import { BankConnectionsRepositoryModule } from '../repositories/bank-connections-repository.module';
import { BankConnectionDomain } from './bank-connection.domain';
import { PluggyCredentialsDomain } from './pluggy-credentials.domain';

@Module({
    imports: [BankConnectionsRepositoryModule],
    providers: [PluggyCredentialsDomain, BankConnectionDomain],
    exports: [PluggyCredentialsDomain, BankConnectionDomain]
})
export class BankConnectionsDomainModule {}
