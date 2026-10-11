import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { BankConnectionAccountsRepository } from './bank-connection-accounts.repository';
import { BankConnectionsRepository } from './bank-connections.repository';
import { BankSyncRunsRepository } from './bank-sync-runs.repository';
import { PluggyCredentialsRepository } from './pluggy-credentials.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [PluggyCredentialsRepository, BankConnectionsRepository, BankConnectionAccountsRepository, BankSyncRunsRepository],
    exports: [PluggyCredentialsRepository, BankConnectionsRepository, BankConnectionAccountsRepository, BankSyncRunsRepository]
})
export class BankConnectionsRepositoryModule {}
