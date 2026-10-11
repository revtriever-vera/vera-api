import { describe, expect, it } from 'vitest';
import { KmsSecretSealerDriver } from './drivers/kms-secret-sealer.driver';
import { LocalSecretSealerDriver } from './drivers/local-secret-sealer.driver';
import { buildSecretSealer } from './secret-sealer.factory';

const CRYPTO = { CRYPTO_KEY_HEX: 'a'.repeat(64) };
const BASE = {
    SECRET_SEALER_KMS_KEY_ID: 'alias/vera-secrets-test',
    SECRET_SEALER_ALLOW_LOCAL_IN_PROD: false,
    SECRET_SEALER_ALLOW_LEGACY_LOCAL: false
};

describe('buildSecretSealer', () => {
    it('builds the local driver', () => {
        expect(buildSecretSealer({ ...BASE, SECRET_SEALER_DRIVER: 'local' }, CRYPTO)).toBeInstanceOf(LocalSecretSealerDriver);
    });

    it('builds the kms driver', () => {
        const sealer = buildSecretSealer({ ...BASE, SECRET_SEALER_DRIVER: 'kms' }, CRYPTO);

        expect(sealer).toBeInstanceOf(KmsSecretSealerDriver);
        expect(sealer.driver).toBe('kms');
    });

    it('lets the kms driver read legacy local secrets only when the flag is on', async () => {
        const local = new LocalSecretSealerDriver(CRYPTO.CRYPTO_KEY_HEX);
        const context = { companyId: 'company-a', purpose: 'test-purpose' };
        const sealed: string = await local.seal('old', context);

        const closed = buildSecretSealer({ ...BASE, SECRET_SEALER_DRIVER: 'kms' }, CRYPTO);
        const open = buildSecretSealer({ ...BASE, SECRET_SEALER_DRIVER: 'kms', SECRET_SEALER_ALLOW_LEGACY_LOCAL: true }, CRYPTO);

        await expect(closed.open(sealed, context)).rejects.toMatchObject({ code: 'core.secret_sealer_mismatch' });
        await expect(open.open(sealed, context)).resolves.toBe('old');
    });
});
