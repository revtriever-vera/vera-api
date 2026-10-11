import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueueModule } from '../../../../core/queue/queue.module';
import { BankConnectionsApplicationModule } from '../../application/bank-connections-application.module';
import { bankConnectionsConfig } from '../../config/bank-connections.config';
import { ConnectionSyncHandler } from './connection-sync.handler';

@Module({
    imports: [BankConnectionsApplicationModule, QueueModule, ConfigModule.forFeature(bankConnectionsConfig)],
    providers: [ConnectionSyncHandler]
})
export class BankConnectionsQueueModule {}
