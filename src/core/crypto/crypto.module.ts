import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { ContextModule } from '../context/context.module';
import { LogService } from '../observability/log.service';
import { MetricsService } from '../observability/metrics.service';
import { ObservabilityModule } from '../observability/observability.module';
import { AesGcmCryptoDriver } from './aes-gcm-crypto.driver';
import { cryptoConfig } from './config/crypto.config';
import { secretSealerConfig } from './config/secret-sealer.config';
import { CryptoPort } from './crypto.port';
import { HmacSha256Driver } from './hmac-sha256.driver';
import { HmacPort } from './hmac.port';
import { ObservedSecretSealer } from './observed-secret-sealer';
import { SecretResealService } from './secret-reseal.service';
import { buildSecretSealer } from './secret-sealer.factory';
import { SecretSealerPort } from './secret-sealer.port';

@Module({
    imports: [
        ConfigModule.forFeature(cryptoConfig),
        ConfigModule.forFeature(secretSealerConfig),
        ObservabilityModule,
        ContextModule,
        DiscoveryModule
    ],
    providers: [
        { provide: CryptoPort, useClass: AesGcmCryptoDriver },
        { provide: HmacPort, useClass: HmacSha256Driver },
        {
            provide: SecretSealerPort,
            inject: [secretSealerConfig.KEY, cryptoConfig.KEY, LogService, MetricsService],
            useFactory: (
                sealer: ConfigType<typeof secretSealerConfig>,
                crypto: ConfigType<typeof cryptoConfig>,
                logs: LogService,
                metrics: MetricsService
            ): SecretSealerPort => new ObservedSecretSealer(buildSecretSealer(sealer, crypto), logs, metrics)
        },
        SecretResealService
    ],
    exports: [CryptoPort, HmacPort, SecretSealerPort, SecretResealService]
})
export class CryptoModule {}
