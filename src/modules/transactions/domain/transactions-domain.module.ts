import { Module } from '@nestjs/common';
import { TransactionsRepositoryModule } from '../repositories/transactions-repository.module';
import { FinancialAccountDomain } from './financial-account.domain';
import { TransactionImportDomain } from './transaction-import.domain';
import { TransactionDomain } from './transaction.domain';

@Module({
    imports: [TransactionsRepositoryModule],
    providers: [FinancialAccountDomain, TransactionDomain, TransactionImportDomain],
    exports: [FinancialAccountDomain, TransactionDomain, TransactionImportDomain]
})
export class TransactionsDomainModule {}
