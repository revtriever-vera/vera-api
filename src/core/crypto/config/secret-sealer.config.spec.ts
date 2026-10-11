import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { secretSealerConfig, SecretSealerConfig } from './secret-sealer.config';

const ORIGINAL_ENV: NodeJS.ProcessEnv = { ...process.env };

function setEnvironment(values: Record<string, string | undefined>): void {
    process.env = { ...ORIGINAL_ENV };
    for (const name of [
        'IS_LOCAL',
        'DEPLOY_ENV',
        'NODE_ENV',
        'SECRET_SEALER_DRIVER',
        'SECRET_SEALER_KMS_KEY_ID',
        'SECRET_SEALER_ALLOW_LOCAL_IN_PROD',
        'SECRET_SEALER_ALLOW_LEGACY_LOCAL'
    ]) {
        Reflect.deleteProperty(process.env, name);
    }
    for (const [name, value] of Object.entries(values)) {
        if (value !== undefined) {
            process.env[name] = value;
        }
    }
}

describe('secretSealerConfig', () => {
    beforeEach(() => {
        setEnvironment({});
    });

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    it('uses the local driver by default when running locally', () => {
        setEnvironment({ IS_LOCAL: 'true', DEPLOY_ENV: 'local' });

        const config: SecretSealerConfig = secretSealerConfig();

        expect(config.SECRET_SEALER_DRIVER).toBe('local');
        expect(config.SECRET_SEALER_ALLOW_LEGACY_LOCAL).toBe(false);
    });

    it('treats blank values as unset', () => {
        setEnvironment({ IS_LOCAL: 'true', SECRET_SEALER_DRIVER: '', SECRET_SEALER_KMS_KEY_ID: '', SECRET_SEALER_ALLOW_LOCAL_IN_PROD: '' });

        expect(secretSealerConfig().SECRET_SEALER_DRIVER).toBe('local');
    });

    it('requires the driver outside of local', () => {
        setEnvironment({ IS_LOCAL: 'false', DEPLOY_ENV: 'dev' });

        expect(() => secretSealerConfig()).toThrow(/SECRET_SEALER_DRIVER/);
    });

    it('requires the key id for kms', () => {
        setEnvironment({ IS_LOCAL: 'false', DEPLOY_ENV: 'dev', SECRET_SEALER_DRIVER: 'kms' });

        expect(() => secretSealerConfig()).toThrow(/SECRET_SEALER_KMS_KEY_ID/);
    });

    it('accepts kms with a key alias and the legacy flag', () => {
        setEnvironment({
            IS_LOCAL: 'false',
            DEPLOY_ENV: 'prod',
            SECRET_SEALER_DRIVER: 'kms',
            SECRET_SEALER_KMS_KEY_ID: 'alias/vera-secrets-test',
            SECRET_SEALER_ALLOW_LEGACY_LOCAL: 'true'
        });

        expect(secretSealerConfig()).toEqual({
            SECRET_SEALER_DRIVER: 'kms',
            SECRET_SEALER_KMS_KEY_ID: 'alias/vera-secrets-test',
            SECRET_SEALER_ALLOW_LOCAL_IN_PROD: false,
            SECRET_SEALER_ALLOW_LEGACY_LOCAL: true
        });
    });

    it('accepts local in dev', () => {
        setEnvironment({ IS_LOCAL: 'false', DEPLOY_ENV: 'dev', SECRET_SEALER_DRIVER: 'local' });

        expect(secretSealerConfig().SECRET_SEALER_DRIVER).toBe('local');
    });

    it('refuses local in prod without the explicit escape', () => {
        setEnvironment({ IS_LOCAL: 'false', DEPLOY_ENV: 'prod', SECRET_SEALER_DRIVER: 'local' });

        expect(() => secretSealerConfig()).toThrow(/ALLOW_LOCAL_IN_PROD/);
    });

    it('refuses local when only NODE_ENV says production', () => {
        setEnvironment({ IS_LOCAL: 'false', NODE_ENV: 'production', SECRET_SEALER_DRIVER: 'local' });

        expect(() => secretSealerConfig()).toThrow(/ALLOW_LOCAL_IN_PROD/);
    });

    it('accepts local in prod with the escape turned on', () => {
        setEnvironment({
            IS_LOCAL: 'false',
            DEPLOY_ENV: 'prod',
            SECRET_SEALER_DRIVER: 'local',
            SECRET_SEALER_ALLOW_LOCAL_IN_PROD: 'true'
        });

        const config: SecretSealerConfig = secretSealerConfig();

        expect(config.SECRET_SEALER_DRIVER).toBe('local');
        expect(config.SECRET_SEALER_ALLOW_LOCAL_IN_PROD).toBe(true);
    });

    it('rejects an unknown driver', () => {
        setEnvironment({ IS_LOCAL: 'true', SECRET_SEALER_DRIVER: 'vault' });

        expect(() => secretSealerConfig()).toThrow();
    });
});
