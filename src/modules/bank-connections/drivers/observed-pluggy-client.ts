import { PluggyClientPort, PluggyAccount, PluggyItem, PluggyTransactionPage, PluggyTransactionQuery } from '../ports/pluggy-client.port';
import { PluggyAuthRejectedError, PluggyNotFoundError, PluggyUnavailableError } from '../ports/pluggy-client.errors';
import { BankConnectionsLogService, ProviderEndpoint } from '../services/bank-connections-log.service';
import { BankConnectionsMetricsService } from '../services/bank-connections-metrics.service';
import { PluggyCredentialsPlain, PluggySession } from './pluggy-session';

const HTTP_OK: number = 200;
const HTTP_UNAUTHORIZED: number = 401;
const HTTP_NOT_FOUND: number = 404;

interface CallOutcome {
    readonly status: number | null;
    readonly reason: string | null;
    readonly retryAfterSeconds: number | null;
}

function outcomeOf(error: unknown): CallOutcome {
    if (error instanceof PluggyAuthRejectedError) {
        return { status: HTTP_UNAUTHORIZED, reason: 'auth_rejected', retryAfterSeconds: null };
    }
    if (error instanceof PluggyNotFoundError) {
        return { status: HTTP_NOT_FOUND, reason: 'not_found', retryAfterSeconds: null };
    }
    if (error instanceof PluggyUnavailableError) {
        return { status: error.httpStatus, reason: error.reason, retryAfterSeconds: error.retryAfterSeconds };
    }
    return { status: null, reason: 'unexpected', retryAfterSeconds: null };
}

export class ObservedPluggyClient extends PluggyClientPort {
    public constructor(
        private readonly inner: PluggyClientPort,
        private readonly logs: BankConnectionsLogService,
        private readonly metrics: BankConnectionsMetricsService
    ) {
        super();
    }

    public async authenticate(credentials: PluggyCredentialsPlain): Promise<PluggySession> {
        return this.track('auth', async () => this.inner.authenticate(credentials));
    }

    public async getItem(session: PluggySession, itemId: string): Promise<PluggyItem | null> {
        return this.track('item', async () => this.inner.getItem(session, itemId));
    }

    public async listAccounts(session: PluggySession, itemId: string): Promise<readonly PluggyAccount[]> {
        return this.track('accounts', async () => this.inner.listAccounts(session, itemId));
    }

    public async listTransactions(session: PluggySession, query: PluggyTransactionQuery): Promise<PluggyTransactionPage> {
        return this.track('transactions', async () => this.inner.listTransactions(session, query));
    }

    private async track<T>(endpoint: ProviderEndpoint, call: () => Promise<T>): Promise<T> {
        try {
            const result: T = await call();
            this.record(endpoint, { status: result === null ? HTTP_NOT_FOUND : HTTP_OK, reason: null, retryAfterSeconds: null });
            return result;
        } catch (error: unknown) {
            this.record(endpoint, outcomeOf(error));
            throw error;
        }
    }

    private record(endpoint: ProviderEndpoint, outcome: CallOutcome): void {
        this.metrics.providerRequest(endpoint, outcome.status);
        this.logs.providerCall(endpoint, outcome.status, outcome.reason, outcome.retryAfterSeconds);
    }
}
