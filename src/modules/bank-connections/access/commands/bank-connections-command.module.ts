import { Module } from '@nestjs/common';
import { BankConnectionsApplicationModule } from '../../application/bank-connections-application.module';
import { SyncDailyCommand, SyncDailyTickHandler } from './sync-daily.command';

@Module({
    imports: [BankConnectionsApplicationModule],
    providers: [SyncDailyCommand, SyncDailyTickHandler]
})
export class BankConnectionsCommandModule {}
