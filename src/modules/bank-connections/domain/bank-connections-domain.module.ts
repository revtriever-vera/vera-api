import { Module } from '@nestjs/common';
import { BankConnectionsRepositoryModule } from '../repositories/bank-connections-repository.module';
import { BankConnectionDomain } from './bank-connection.domain';
import { ConnectionLinkDomain } from './connection-link.domain';
import { SyncRunDomain } from './sync-run.domain';
import { PluggyCredentialsDomain } from './pluggy-credentials.domain';

@Module({
    imports: [BankConnectionsRepositoryModule],
    providers: [PluggyCredentialsDomain, BankConnectionDomain, ConnectionLinkDomain, SyncRunDomain],
    exports: [PluggyCredentialsDomain, BankConnectionDomain, ConnectionLinkDomain, SyncRunDomain]
})
export class BankConnectionsDomainModule {}
