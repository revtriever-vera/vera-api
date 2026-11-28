import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ContextModule } from '../../../../core/context/context.module';
import { ThrottleModule } from '../../../../core/throttle/throttle.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { BankConnectionsApplicationModule } from '../../application/bank-connections-application.module';
import { bankConnectionsConfig } from '../../config/bank-connections.config';
import { PluggyConnectDevController } from './pluggy-connect-dev.controller';
import { PluggyConnectController } from './pluggy-connect.controller';
import { PluggyWebhookController } from './pluggy-webhook.controller';
import { ConnectionsController } from './connections.controller';
import { CredentialsController } from './credentials.controller';
import { SyncController } from './sync.controller';

@Module({
    imports: [
        BankConnectionsApplicationModule,
        IdentityApplicationModule,
        ThrottleModule,
        ContextModule,
        ConfigModule.forFeature(bankConnectionsConfig)
    ],
    controllers: [
        CredentialsController,
        PluggyConnectController,
        ConnectionsController,
        SyncController,
        PluggyWebhookController,
        PluggyConnectDevController
    ]
})
export class BankConnectionsHttpModule {}
