import { AppError } from '../../shared/errors/app.error';
import { LogService } from '../observability/log.service';
import { MetricsService } from '../observability/metrics.service';
import { SealContext, SecretSealerDriverName, SecretSealerPort } from './secret-sealer.port';

const LOG_IDENTIFIER: string = 'secret-sealer';
const METRIC_NAME: string = 'vera_secret_sealer_total';
const UNEXPECTED_REASON: string = 'unexpected';

type SealerOperation = 'seal' | 'open';

export class ObservedSecretSealer extends SecretSealerPort {
    public readonly driver: SecretSealerDriverName;

    public constructor(
        private readonly inner: SecretSealerPort,
        private readonly logs: LogService,
        private readonly metrics: MetricsService
    ) {
        super();
        this.driver = inner.driver;
    }

    public async seal(plain: string, context: SealContext): Promise<string> {
        return this.observe('seal', context, async () => this.inner.seal(plain, context));
    }

    public async open(sealed: string, context: SealContext): Promise<string> {
        return this.observe('open', context, async () => this.inner.open(sealed, context));
    }

    private async observe(op: SealerOperation, context: SealContext, action: () => Promise<string>): Promise<string> {
        try {
            const result: string = await action();
            this.metrics.count(METRIC_NAME, { driver: this.driver, op, result: 'ok' });
            return result;
        } catch (error: unknown) {
            this.metrics.count(METRIC_NAME, { driver: this.driver, op, result: 'error' });
            this.logs.error({
                message: 'secret sealer operation failed',
                identifier: LOG_IDENTIFIER,
                meta: {
                    driver: this.driver,
                    purpose: context.purpose,
                    op,
                    reason: error instanceof AppError ? error.code : UNEXPECTED_REASON
                }
            });
            throw error;
        }
    }
}
