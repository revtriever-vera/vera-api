import { ConfigType } from '@nestjs/config';
import { vi } from 'vitest';
import { AppContext } from '../../src/core/context/app-context.port';
import { ContextHolder } from '../../src/core/context/as-company.decorator';
import { LocalSecretSealerDriver } from '../../src/core/crypto/drivers/local-secret-sealer.driver';
import { DatabaseClient } from '../../src/core/database/database.client';
import { TransactionalContext } from '../../src/core/database/using-transaction.decorator';
import { LogService } from '../../src/core/observability/log.service';
import { MetricsService } from '../../src/core/observability/metrics.service';
import { PublishOptions, QueuePublisherPort } from '../../src/core/queue/queue.types';
import { QueueName } from '../../src/shared/constants/queues.constants';
import { ConnectionsApplication } from '../../src/modules/bank-connections/application/connections.application';
import { CredentialsApplication } from '../../src/modules/bank-connections/application/credentials.application';
import { bankConnectionsConfig } from '../../src/modules/bank-connections/config/bank-connections.config';
import { BankConnectionDomain } from '../../src/modules/bank-connections/domain/bank-connection.domain';
import {
    BankConnection,
    BankConnectionAccount,
    BankSyncRun,
    ConnectionDraft,
    ConnectionIdentity,
    PluggyCredential
} from '../../src/modules/bank-connections/domain/bank-connections.types';
import { PluggyCredentialsDomain } from '../../src/modules/bank-connections/domain/pluggy-credentials.domain';
import { MockPluggyClientDriver } from '../../src/modules/bank-connections/drivers/mock-pluggy-client.driver';
import { ObservedPluggyClient } from '../../src/modules/bank-connections/drivers/observed-pluggy-client';
import { PluggyClientPort } from '../../src/modules/bank-connections/ports/pluggy-client.port';
import { BankConnectionsExporter } from '../../src/modules/bank-connections/services/bank-connections.exporter';
import { BankConnectionsLogService } from '../../src/modules/bank-connections/services/bank-connections-log.service';
import { BankConnectionsMetricsService } from '../../src/modules/bank-connections/services/bank-connections-metrics.service';
import { BankSyncPublisherService } from '../../src/modules/bank-connections/services/bank-sync-publisher.service';
import { ConnectionViewService } from '../../src/modules/bank-connections/services/connection-view.service';
import { CredentialsVaultService } from '../../src/modules/bank-connections/services/credentials-vault.service';
import { PluggyAuthenticatorService } from '../../src/modules/bank-connections/services/pluggy-authenticator.service';
import { PluggyCredentialsEraser } from '../../src/modules/bank-connections/services/pluggy-credentials.eraser';
import { FinancialAccountService } from '../../src/modules/transactions/services/financial-account.service';
import { SpendingDatasetService } from '../../src/modules/transactions/services/spending-dataset.service';

export const COMPANY_ID: string = 'company-1';
export const CLIENT_ID: string = '3f9a1b2c-4d5e-4f60-8a9b-c2e1d3f4a5b6';
export const SENTINEL: string = 'vera-sentinel-0f3c9d2a-77aa-4b1e-9c11-0123456789ab';
export const ITEM_NUBANK: string = '00000000-0000-4000-8000-00000000a001';
export const ITEM_ITAU: string = '00000000-0000-4000-8000-00000000a002';
export const ITEM_MISSING: string = '00000000-0000-4000-8000-00000000a404';
export const ITEM_LOGIN_ERROR: string = '00000000-0000-4000-8000-00000000a409';

let sequence: number = 0;

function nextId(prefix: string): string {
    sequence += 1;
    return `${prefix}-${String(sequence)}`;
}

export class InMemoryCredentialsRepository {
    public rows: PluggyCredential[] = [];

    public findCurrent(): Promise<PluggyCredential | null> {
        return Promise.resolve(this.rows[0] ?? null);
    }

    public replaceCurrent(data: { sealed: string; sealerDriver: string; clientIdHint: string }): Promise<{ credential: PluggyCredential; replaced: boolean }> {
        const replaced: boolean = this.rows.length > 0;
        const credential: PluggyCredential = {
            id: nextId('credential'),
            companyId: COMPANY_ID,
            status: 'valid',
            lastVerifiedAt: new Date(),
            lastErrorCode: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            ...data
        };
        this.rows = [credential];
        return Promise.resolve({ credential, replaced });
    }

    public markValid(id: string): Promise<PluggyCredential | null> {
        return Promise.resolve(this.patch(id, { status: 'valid', lastVerifiedAt: new Date(), lastErrorCode: null }));
    }

    public markInvalid(id: string, errorCode: string): Promise<PluggyCredential | null> {
        return Promise.resolve(this.patch(id, { status: 'invalid', lastErrorCode: errorCode }));
    }

    public replaceSealed(id: string, sealed: string, sealerDriver: string): Promise<PluggyCredential | null> {
        return Promise.resolve(this.patch(id, { sealed, sealerDriver }));
    }

    public eraseAll(): Promise<number> {
        const erased: number = this.rows.length;
        this.rows = [];
        return Promise.resolve(erased);
    }

    public listCompanyIdsAcrossTenants(): Promise<string[]> {
        return Promise.resolve(this.rows.map((row: PluggyCredential): string => row.companyId));
    }

    private patch(id: string, patch: Partial<PluggyCredential>): PluggyCredential | null {
        const current: PluggyCredential | undefined = this.rows.find((row: PluggyCredential): boolean => row.id === id);
        if (current === undefined) {
            return null;
        }
        const updated: PluggyCredential = { ...current, ...patch, updatedAt: new Date() };
        this.rows = this.rows.map((row: PluggyCredential): PluggyCredential => (row.id === id ? updated : row));
        return updated;
    }
}

export class InMemoryConnectionsRepository {
    public rows: BankConnection[] = [];

    public listAll(): Promise<BankConnection[]> {
        return Promise.resolve(this.active());
    }

    public findById(id: string): Promise<BankConnection | null> {
        return Promise.resolve(this.active().find((row: BankConnection): boolean => row.id === id) ?? null);
    }

    public findByExternalItemIds(ids: readonly string[]): Promise<BankConnection[]> {
        return Promise.resolve(this.active().filter((row: BankConnection): boolean => ids.includes(row.externalItemId)));
    }

    public countAll(): Promise<number> {
        return Promise.resolve(this.active().length);
    }

    public insertIfAbsent(draft: ConnectionDraft): Promise<BankConnection | null> {
        if (this.active().some((row: BankConnection): boolean => row.externalItemId === draft.externalItemId)) {
            return Promise.resolve(null);
        }
        const row: BankConnection = this.build(draft);
        this.rows = [...this.rows, row];
        return Promise.resolve(row);
    }

    public resumePaused(): Promise<BankConnection[]> {
        return Promise.resolve(
            this.mutate((row: BankConnection): boolean => row.status === 'paused', { status: 'active', statusReason: null })
        );
    }

    public disconnectAll(): Promise<BankConnection[]> {
        return Promise.resolve(this.mutate((): boolean => true, { status: 'disconnected', statusReason: null, deletedAt: new Date() }));
    }

    public disconnectOne(id: string): Promise<BankConnection | null> {
        const changed: BankConnection[] = this.mutate((row: BankConnection): boolean => row.id === id, {
            status: 'disconnected',
            statusReason: null,
            deletedAt: new Date()
        });
        return Promise.resolve(changed[0] ?? null);
    }

    public listSyncableAcrossTenants(): Promise<ConnectionIdentity[]> {
        return Promise.resolve(
            this.active()
                .filter((row: BankConnection): boolean => row.status === 'active' || row.status === 'needs_attention')
                .map((row: BankConnection): ConnectionIdentity => ({ id: row.id, companyId: row.companyId }))
        );
    }

    public findIdentityAcrossTenants(id: string): Promise<ConnectionIdentity | null> {
        const row: BankConnection | undefined = this.rows.find((candidate: BankConnection): boolean => candidate.id === id);
        return Promise.resolve(row === undefined ? null : { id: row.id, companyId: row.companyId });
    }

    public setStatus(id: string, status: string): void {
        this.mutate((row: BankConnection): boolean => row.id === id, { status });
    }

    private active(): BankConnection[] {
        return this.rows.filter((row: BankConnection): boolean => row.deletedAt === null);
    }

    private mutate(match: (row: BankConnection) => boolean, patch: Partial<BankConnection>): BankConnection[] {
        const changed: BankConnection[] = [];
        this.rows = this.rows.map((row: BankConnection): BankConnection => {
            if (row.deletedAt !== null || !match(row)) {
                return row;
            }
            const updated: BankConnection = { ...row, ...patch, updatedAt: new Date() };
            changed.push(updated);
            return updated;
        });
        return changed;
    }

    private build(draft: ConnectionDraft): BankConnection {
        return {
            id: nextId('connection'),
            companyId: COMPANY_ID,
            provider: 'pluggy',
            externalItemId: draft.externalItemId,
            connectorName: draft.connectorName,
            status: draft.status,
            statusReason: draft.statusReason,
            providerStatus: draft.providerStatus,
            consentExpiresAt: draft.consentExpiresAt,
            lastSyncAt: null,
            lastSuccessAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null
        };
    }
}

export class InMemoryLinksRepository {
    public rows: BankConnectionAccount[] = [];

    public link(connectionId: string, accountId: string): void {
        this.rows = [
            ...this.rows,
            {
                id: nextId('link'),
                companyId: COMPANY_ID,
                connectionId,
                accountId,
                externalAccountId: `ext-${accountId}`,
                syncedThrough: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                deletedAt: null
            }
        ];
    }

    public listByConnections(ids: readonly string[]): Promise<BankConnectionAccount[]> {
        return Promise.resolve(this.rows.filter((row: BankConnectionAccount): boolean => row.deletedAt === null && ids.includes(row.connectionId)));
    }

    public unlinkConnections(ids: readonly string[]): Promise<BankConnectionAccount[]> {
        const removed: BankConnectionAccount[] = this.rows.filter(
            (row: BankConnectionAccount): boolean => row.deletedAt === null && ids.includes(row.connectionId)
        );
        this.rows = this.rows.map((row: BankConnectionAccount): BankConnectionAccount => (removed.includes(row) ? { ...row, deletedAt: new Date() } : row));
        return Promise.resolve(removed);
    }
}

export class InMemoryRunsRepository {
    public rows: BankSyncRun[] = [];

    public latestByConnections(ids: readonly string[]): Promise<BankSyncRun[]> {
        return Promise.resolve(this.rows.filter((row: BankSyncRun): boolean => ids.includes(row.connectionId)));
    }
}

export class RecordingPublisher extends QueuePublisherPort {
    public readonly published: { queue: QueueName; type: string; payload: unknown; options: PublishOptions | undefined }[] = [];

    public publish(queue: QueueName, type: string, payload: unknown, options?: PublishOptions): Promise<void> {
        this.published.push({ queue, type, payload, options });
        return Promise.resolve();
    }
}

export interface AccountSummary {
    readonly id: string;
    readonly name: string;
    readonly kind: string;
    readonly numberLast4: string | null;
}

export function configOf(overrides: Partial<ConfigType<typeof bankConnectionsConfig>> = {}): ConfigType<typeof bankConnectionsConfig> {
    return {
        PLUGGY_DRIVER: 'mock',
        PLUGGY_BASE_URL: 'https://pluggy.invalid',
        PLUGGY_HTTP_TIMEOUT_MS: 1000,
        PLUGGY_AUTH_PATH: '/auth',
        PLUGGY_ITEM_PATH: '/items',
        MOCK_PLUGGY_FORCE_401: false,
        MOCK_PLUGGY_REVOKED_ITEMS: [],
        ...overrides
    };
}

export interface Fixture {
    readonly credentials: InMemoryCredentialsRepository;
    readonly connections: InMemoryConnectionsRepository;
    readonly links: InMemoryLinksRepository;
    readonly runs: InMemoryRunsRepository;
    readonly publisher: RecordingPublisher;
    readonly logCalls: unknown[];
    readonly metricCalls: unknown[];
    readonly accountService: { findByIds: ReturnType<typeof vi.fn>; removeProviderAccounts: ReturnType<typeof vi.fn> };
    readonly client: PluggyClientPort;
    readonly vault: CredentialsVaultService;
    readonly credentialsApplication: CredentialsApplication;
    readonly connectionsApplication: ConnectionsApplication;
    readonly eraser: PluggyCredentialsEraser;
    readonly exporter: BankConnectionsExporter;
    readonly credentialsDomain: PluggyCredentialsDomain;
    readonly connectionDomain: BankConnectionDomain;
    readonly sealer: LocalSecretSealerDriver;
}

const MASTER_KEY: string = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';

function contextOf(companyId: string): AppContext {
    const data: { requestId: string; companyId: string; locale: 'pt-BR' } = { requestId: 'request-1', companyId, locale: 'pt-BR' };
    return {
        get: () => data,
        getOrNull: () => data,
        run: <T>(_data: unknown, fn: () => T): T => fn(),
        enrich: (): void => undefined
    } as unknown as AppContext;
}

export function buildFixture(options: { config?: Partial<ConfigType<typeof bankConnectionsConfig>>; client?: PluggyClientPort } = {}): Fixture {
    TransactionalContext.set({ withTransaction: async <T>(fn: () => Promise<T>): Promise<T> => fn() } as unknown as DatabaseClient);
    const logCalls: unknown[] = [];
    const metricCalls: unknown[] = [];
    const logService: LogService = {
        info: (entry: unknown): number => logCalls.push(entry),
        warn: (entry: unknown): number => logCalls.push(entry),
        error: (entry: unknown): number => logCalls.push(entry),
        debug: (entry: unknown): number => logCalls.push(entry)
    } as unknown as LogService;
    const metricsService: MetricsService = {
        count: (...args: unknown[]): number => metricCalls.push(args),
        observe: (...args: unknown[]): number => metricCalls.push(args),
        gauge: (...args: unknown[]): number => metricCalls.push(args)
    } as unknown as MetricsService;
    const logs: BankConnectionsLogService = new BankConnectionsLogService(logService);
    const metrics: BankConnectionsMetricsService = new BankConnectionsMetricsService(metricsService);
    const credentials: InMemoryCredentialsRepository = new InMemoryCredentialsRepository();
    const connections: InMemoryConnectionsRepository = new InMemoryConnectionsRepository();
    const links: InMemoryLinksRepository = new InMemoryLinksRepository();
    const runs: InMemoryRunsRepository = new InMemoryRunsRepository();
    const credentialsDomain: PluggyCredentialsDomain = new PluggyCredentialsDomain(credentials as never);
    const connectionDomain: BankConnectionDomain = new BankConnectionDomain(connections as never, links as never, runs as never);
    const context: AppContext = contextOf(COMPANY_ID);
    ContextHolder.set(context);
    const sealer: LocalSecretSealerDriver = new LocalSecretSealerDriver(MASTER_KEY);
    const vault: CredentialsVaultService = new CredentialsVaultService(credentialsDomain, sealer, context);
    const inner: PluggyClientPort = options.client ?? new MockPluggyClientDriver(configOf(options.config), new SpendingDatasetService());
    const client: PluggyClientPort = new ObservedPluggyClient(inner, logs, metrics);
    const authenticator: PluggyAuthenticatorService = new PluggyAuthenticatorService(client, vault);
    const publisher: RecordingPublisher = new RecordingPublisher();
    const sync: BankSyncPublisherService = new BankSyncPublisherService(publisher, context);
    const accountService = {
        findByIds: vi.fn().mockImplementation((ids: readonly string[]): Promise<AccountSummary[]> =>
            Promise.resolve(ids.map((id: string): AccountSummary => ({ id, name: `Conta ${id}`, kind: 'checking', numberLast4: '1234' })))
        ),
        removeProviderAccounts: vi.fn().mockResolvedValue(0)
    };
    const accounts: FinancialAccountService = accountService as unknown as FinancialAccountService;
    const views: ConnectionViewService = new ConnectionViewService(connectionDomain, accounts);
    return {
        credentials,
        connections,
        links,
        runs,
        publisher,
        logCalls,
        metricCalls,
        accountService,
        client,
        vault,
        credentialsApplication: new CredentialsApplication(vault, authenticator, connectionDomain, accounts, sync, logs, metrics),
        connectionsApplication: new ConnectionsApplication(vault, authenticator, client, connectionDomain, views, accounts, sync, logs),
        eraser: new PluggyCredentialsEraser(credentialsDomain),
        exporter: new BankConnectionsExporter(credentialsDomain, connectionDomain),
        credentialsDomain,
        connectionDomain,
        sealer
    };
}
