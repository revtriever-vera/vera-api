import { Module } from '@nestjs/common';
import { TransactionsExportHttpModule } from './access/http/transactions-export-http.module';

@Module({
    imports: [TransactionsExportHttpModule]
})
export class TransactionsExportModule {}
