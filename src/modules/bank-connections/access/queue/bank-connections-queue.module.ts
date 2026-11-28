import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueueModule } from '../../../../core/queue/queue.module';
import { BankConnectionsApplicationModule } from '../../application/bank-connections-application.module';
import { bankConnectionsConfig } from '../../config/bank-connections.config';
import { ConnectionSyncHandler } from './connection-sync.handler';
import { NotifiedItemRegistrationHandler } from './notified-item-registration.handler';

@Module({
    imports: [BankConnectionsApplicationModule, QueueModule, ConfigModule.forFeature(bankConnectionsConfig)],
    providers: [ConnectionSyncHandler, NotifiedItemRegistrationHandler]
})
export class BankConnectionsQueueModule {}
