import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { ThrottleModule } from '../../../../core/throttle/throttle.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { BankConnectionsApplicationModule } from '../../application/bank-connections-application.module';
import { ConnectionsController } from './connections.controller';
import { CredentialsController } from './credentials.controller';
import { SyncController } from './sync.controller';

@Module({
    imports: [BankConnectionsApplicationModule, IdentityApplicationModule, ThrottleModule, ContextModule],
    controllers: [CredentialsController, ConnectionsController, SyncController]
})
export class BankConnectionsHttpModule {}
