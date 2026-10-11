import { KMSClient } from '@aws-sdk/client-kms';
import { ConfigType } from '@nestjs/config';
import { cryptoConfig } from './config/crypto.config';
import { secretSealerConfig } from './config/secret-sealer.config';
import { KmsSecretSealerDriver } from './drivers/kms-secret-sealer.driver';
import { LocalSecretSealerDriver } from './drivers/local-secret-sealer.driver';
import { SecretSealerPort } from './secret-sealer.port';

export function buildSecretSealer(
    sealer: ConfigType<typeof secretSealerConfig>,
    crypto: ConfigType<typeof cryptoConfig>
): SecretSealerPort {
    const local: LocalSecretSealerDriver = new LocalSecretSealerDriver(crypto.CRYPTO_KEY_HEX);
    if (sealer.SECRET_SEALER_DRIVER === 'local') {
        return local;
    }
    return new KmsSecretSealerDriver(
        new KMSClient({}),
        sealer.SECRET_SEALER_KMS_KEY_ID,
        sealer.SECRET_SEALER_ALLOW_LEGACY_LOCAL ? local : null
    );
}
