import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { ContextModule } from '../../../core/context/context.module';
import { CryptoModule } from '../../../core/crypto/crypto.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { QueueModule } from '../../../core/queue/queue.module';
import { TransactionsApplicationModule } from '../../transactions/application/transactions-application.module';
import { bankConnectionsConfig } from '../config/bank-connections.config';
import { BankConnectionsDomainModule } from '../domain/bank-connections-domain.module';
import { LivePluggyClientDriver } from '../drivers/live-pluggy-client.driver';
import { MockPluggyClientDriver } from '../drivers/mock-pluggy-client.driver';
import { ObservedPluggyClient } from '../drivers/observed-pluggy-client';
import { PluggyClientPort } from '../ports/pluggy-client.port';
import { BankConnectionReaderService } from '../services/bank-connection-reader.service';
import { BankConnectionsExporter } from '../services/bank-connections.exporter';
import { BankConnectionsLogService } from '../services/bank-connections-log.service';
import { BankConnectionsMetricsService } from '../services/bank-connections-metrics.service';
import { BankSyncPublisherService } from '../services/bank-sync-publisher.service';
import { ConnectionViewService } from '../services/connection-view.service';
import { CredentialsVaultService } from '../services/credentials-vault.service';
import { PluggyAvailabilityService } from '../services/pluggy-availability.service';
import { PluggyAuthenticatorService } from '../services/pluggy-authenticator.service';
import { PluggyCredentialsEraser } from '../services/pluggy-credentials.eraser';
import { PluggyCredentialsResealer } from '../services/pluggy-credentials.resealer';
import { ConnectionsApplication } from './connections.application';
import { CredentialsApplication } from './credentials.application';

@Module({
    imports: [
        ConfigModule.forFeature(bankConnectionsConfig),
        BankConnectionsDomainModule,
        TransactionsApplicationModule,
        CryptoModule,
        ContextModule,
        QueueModule,
        ObservabilityModule
    ],
    providers: [
        CredentialsApplication,
        ConnectionsApplication,
        BankConnectionsLogService,
        BankConnectionsMetricsService,
        CredentialsVaultService,
        PluggyAuthenticatorService,
        PluggyAvailabilityService,
        BankSyncPublisherService,
        ConnectionViewService,
        BankConnectionReaderService,
        PluggyCredentialsEraser,
        BankConnectionsExporter,
        PluggyCredentialsResealer,
        LivePluggyClientDriver,
        MockPluggyClientDriver,
        {
            provide: PluggyClientPort,
            inject: [
                bankConnectionsConfig.KEY,
                LivePluggyClientDriver,
                MockPluggyClientDriver,
                BankConnectionsLogService,
                BankConnectionsMetricsService
            ],
            useFactory: (
                config: ConfigType<typeof bankConnectionsConfig>,
                live: LivePluggyClientDriver,
                mock: MockPluggyClientDriver,
                logs: BankConnectionsLogService,
                metrics: BankConnectionsMetricsService
            ): PluggyClientPort => new ObservedPluggyClient(config.PLUGGY_DRIVER === 'mock' ? mock : live, logs, metrics)
        }
    ],
    exports: [CredentialsApplication, ConnectionsApplication, CredentialsVaultService, BankConnectionReaderService, PluggyClientPort]
})
export class BankConnectionsApplicationModule {}
