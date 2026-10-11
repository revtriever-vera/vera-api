import { AppError } from '../../shared/errors/app.error';
import { SecretSealerDriverName } from './secret-sealer.port';

export class SecretOpenFailedError extends AppError {
    public constructor(driver: SecretSealerDriverName, purpose: string) {
        super({
            code: 'core.secret_open_failed',
            status: 500,
            detail: 'The sealed secret could not be opened.',
            meta: { driver, purpose }
        });
    }
}

export class SecretSealFailedError extends AppError {
    public constructor(driver: SecretSealerDriverName, purpose: string) {
        super({
            code: 'core.secret_seal_failed',
            status: 500,
            detail: 'The secret could not be sealed.',
            meta: { driver, purpose }
        });
    }
}

export class SecretSealerMismatchError extends AppError {
    public constructor(configured: SecretSealerDriverName, found: SecretSealerDriverName) {
        super({
            code: 'core.secret_sealer_mismatch',
            status: 500,
            detail: 'The sealed secret was produced by a different driver than the configured one.',
            meta: { driver: configured, found }
        });
    }
}
