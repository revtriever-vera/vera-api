import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { FinancialAccountsRepository } from './financial-accounts.repository';
import { TransactionImportsRepository } from './transaction-imports.repository';
import { TransactionsRepository } from './transactions.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [FinancialAccountsRepository, TransactionsRepository, TransactionImportsRepository],
    exports: [FinancialAccountsRepository, TransactionsRepository, TransactionImportsRepository]
})
export class TransactionsRepositoryModule {}
