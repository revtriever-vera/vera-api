import { Module } from '@nestjs/common';
import { TransactionsHttpModule } from './access/http/transactions-http.module';

@Module({
    imports: [TransactionsHttpModule]
})
export class TransactionsModule {}
