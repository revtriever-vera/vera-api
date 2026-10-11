import { Module } from '@nestjs/common';
import { BankConnectionsCommandModule } from './access/commands/bank-connections-command.module';
import { BankConnectionsHttpModule } from './access/http/bank-connections-http.module';
import { BankConnectionsQueueModule } from './access/queue/bank-connections-queue.module';

@Module({
    imports: [BankConnectionsHttpModule, BankConnectionsCommandModule, BankConnectionsQueueModule]
})
export class BankConnectionsModule {}
