import { Module } from '@nestjs/common';
import { BankConnectionsHttpModule } from './access/http/bank-connections-http.module';

@Module({
    imports: [BankConnectionsHttpModule]
})
export class BankConnectionsModule {}
