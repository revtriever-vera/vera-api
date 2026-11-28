import { Module } from '@nestjs/common';
import { StatementImportHttpModule } from './access/http/statement-import-http.module';
import { StatementImportQueueModule } from './access/queue/statement-import-queue.module';

@Module({
    imports: [StatementImportHttpModule, StatementImportQueueModule]
})
export class StatementImportModule {}
