import { ConfigType } from '@nestjs/config';
import { DateUtil } from '../../src/shared/utils/date.util';
import { AppContext } from '../../src/core/context/app-context.port';
import { LogService } from '../../src/core/observability/log.service';
import { MetricsService } from '../../src/core/observability/metrics.service';
import { ConnectionSyncApplication } from '../../src/modules/bank-connections/application/connection-sync.application';
import { ManualSyncApplication } from '../../src/modules/bank-connections/application/manual-sync.application';
import { SyncFanoutApplication } from '../../src/modules/bank-connections/application/sync-fanout.application';
import { bankConnectionsConfig } from '../../src/modules/bank-connections/config/bank-connections.config';
import { BankConnection } from '../../src/modules/bank-connections/domain/bank-connections.types';
import { ConnectionLinkDomain } from '../../src/modules/bank-connections/domain/connection-link.domain';
import { SyncRunDomain } from '../../src/modules/bank-connections/domain/sync-run.domain';
import { BankConnectionReaderService } from '../../src/modules/bank-connections/services/bank-connection-reader.service';
import { BankConnectionsLogService } from '../../src/modules/bank-connections/services/bank-connections-log.service';
import { BankConnectionsMetricsService } from '../../src/modules/bank-connections/services/bank-connections-metrics.service';
import { BankSyncPublisherService } from '../../src/modules/bank-connections/services/bank-sync-publisher.service';
import { ConnectionDataSyncService } from '../../src/modules/bank-connections/services/connection-data-sync.service';
import { PluggyAccountSyncService } from '../../src/modules/bank-connections/services/pluggy-account-sync.service';
import { PluggyAuthenticatorService } from '../../src/modules/bank-connections/services/pluggy-authenticator.service';
import { PluggyAvailabilityService } from '../../src/modules/bank-connections/services/pluggy-availability.service';
import { PluggyTransactionSyncService } from '../../src/modules/bank-connections/services/pluggy-transaction-sync.service';
import { CompanyTimezoneService } from '../../src/modules/identity/services/company-timezone.service';
import { FinancialAccountService } from '../../src/modules/transactions/services/financial-account.service';
import {
    IngestionBatch,
    IngestionResult,
    TransactionIngestionService
} from '../../src/modules/transactions/services/transaction-ingestion.service';
import { buildFixture, COMPANY_ID, configOf, Fixture } from './bank-connections-fakes';

export interface FakeAccount {
    readonly id: string;
    readonly externalId: string;
    readonly kind: string;
    readonly name: string;
    readonly currency: string;
    readonly numberLast4: string | null;
    readonly institutionName: string | null;
}

export class FakeFinancialAccounts {
    public readonly rows: Map<string, FakeAccount> = new Map<string, FakeAccount>();
    public failFor: ReadonlySet<string> = new Set<string>();

    public upsertProviderAccount(input: {
        externalId: string;
        kind: string;
        name: string;
        currency: string;
        numberLast4?: string | null;
        institutionName?: string | null;
    }): Promise<FakeAccount> {
        if (this.failFor.has(input.externalId)) {
            return Promise.reject(new Error('account limit'));
        }
        const existing: FakeAccount | undefined = this.rows.get(input.externalId);
        const row: FakeAccount = {
            id: existing?.id ?? `account-${input.externalId}`,
            externalId: input.externalId,
            kind: input.kind,
            name: existing?.name ?? input.name,
            currency: input.currency,
            numberLast4: input.numberLast4 ?? null,
            institutionName: input.institutionName ?? null
        };
        this.rows.set(input.externalId, row);
        return Promise.resolve(row);
    }
}

export class RecordingIngestion {
    public readonly batches: IngestionBatch[] = [];
    public failForAccount: ReadonlySet<string> = new Set<string>();
    private readonly seen: Set<string> = new Set<string>();

    public ingest(batch: IngestionBatch): Promise<IngestionResult> {
        if (this.failForAccount.has(batch.accountId)) {
            return Promise.reject(new Error('ingestion failed'));
        }
        this.batches.push(batch);
        let inserted: number = 0;
        let unchanged: number = 0;
        for (const item of batch.items) {
            const key: string = `${batch.accountId}|${item.externalId}`;
            if (this.seen.has(key)) {
                unchanged += 1;
                continue;
            }
            this.seen.add(key);
            inserted += 1;
        }
        return Promise.resolve({ inserted, updated: 0, unchanged, duplicates: 0, superseded: 0, rejected: 0 });
    }

    public items(): IngestionBatch['items'][number][] {
        return this.batches.flatMap((batch: IngestionBatch) => [...batch.items]);
    }
}

export interface SyncFixture extends Fixture {
    readonly financialAccounts: FakeFinancialAccounts;
    readonly ingestion: RecordingIngestion;
    readonly today: { value: string };
    readonly logEntries: unknown[];
    readonly metricEntries: unknown[];
    readonly syncApplication: ConnectionSyncApplication;
    readonly fanoutApplication: SyncFanoutApplication;
    readonly manualApplication: ManualSyncApplication;
    readonly runDomain: SyncRunDomain;
    readonly linkDomain: ConnectionLinkDomain;
    readonly reader: BankConnectionReaderService;
    readonly config: ConfigType<typeof bankConnectionsConfig>;
}

interface SyncObservability {
    readonly logEntries: unknown[];
    readonly metricEntries: unknown[];
    readonly logs: BankConnectionsLogService;
    readonly metrics: BankConnectionsMetricsService;
}

function syncObservability(): SyncObservability {
    const logEntries: unknown[] = [];
    const metricEntries: unknown[] = [];
    const record = (entry: unknown): number => logEntries.push(entry);
    const track = (...args: unknown[]): number => metricEntries.push(args);
    const logService: LogService = { info: record, warn: record, error: record, debug: record } as unknown as LogService;
    const metricsService: MetricsService = { count: track, observe: track, gauge: track } as unknown as MetricsService;
    return {
        logEntries,
        metricEntries,
        logs: new BankConnectionsLogService(logService),
        metrics: new BankConnectionsMetricsService(metricsService)
    };
}

interface Collaborators {
    readonly financialAccounts: FakeFinancialAccounts;
    readonly ingestion: RecordingIngestion;
    readonly today: { value: string };
    readonly runDomain: SyncRunDomain;
    readonly linkDomain: ConnectionLinkDomain;
}

function collaboratorsOf(fixture: Fixture): Collaborators {
    return {
        financialAccounts: new FakeFinancialAccounts(),
        ingestion: new RecordingIngestion(),
        today: { value: DateUtil.todayInBrazil() },
        runDomain: new SyncRunDomain(fixture.runs as never),
        linkDomain: new ConnectionLinkDomain(fixture.links as never)
    };
}

function dataSyncOf(
    fixture: Fixture,
    parts: Collaborators,
    observability: SyncObservability,
    config: ConfigType<typeof bankConnectionsConfig>
): ConnectionDataSyncService {
    const accountSync: PluggyAccountSyncService = new PluggyAccountSyncService(
        fixture.client,
        parts.financialAccounts as unknown as FinancialAccountService,
        parts.linkDomain,
        observability.logs
    );
    const transactionSync: PluggyTransactionSyncService = new PluggyTransactionSyncService(
        fixture.client,
        parts.ingestion as unknown as TransactionIngestionService,
        parts.linkDomain,
        observability.logs,
        config
    );
    const timezone: CompanyTimezoneService = {
        todayInCompany: () => Promise.resolve(parts.today.value)
    } as unknown as CompanyTimezoneService;
    return new ConnectionDataSyncService(fixture.client, fixture.connectionDomain, accountSync, transactionSync, timezone);
}

function applicationsOf(
    fixture: Fixture,
    parts: Collaborators,
    observability: SyncObservability,
    config: ConfigType<typeof bankConnectionsConfig>
): Pick<SyncFixture, 'syncApplication' | 'fanoutApplication' | 'manualApplication' | 'reader'> {
    const reader: BankConnectionReaderService = new BankConnectionReaderService(fixture.connectionDomain);
    const context: AppContext = { getOrNull: () => ({ companyId: COMPANY_ID }) } as unknown as AppContext;
    const publisher: BankSyncPublisherService = new BankSyncPublisherService(fixture.publisher, context, observability.logs);
    const { logs, metrics } = observability;
    return {
        reader,
        syncApplication: syncApplicationOf(fixture, parts, observability, config, reader),
        fanoutApplication: new SyncFanoutApplication(reader, publisher, logs, metrics, config),
        manualApplication: new ManualSyncApplication(fixture.vault, fixture.connectionDomain, parts.runDomain, publisher)
    };
}

function syncApplicationOf(
    fixture: Fixture,
    parts: Collaborators,
    observability: SyncObservability,
    config: ConfigType<typeof bankConnectionsConfig>,
    reader: BankConnectionReaderService
): ConnectionSyncApplication {
    const authenticator: PluggyAuthenticatorService = new PluggyAuthenticatorService(
        fixture.client,
        fixture.vault,
        new PluggyAvailabilityService(config)
    );
    return new ConnectionSyncApplication(
        reader,
        fixture.connectionDomain,
        parts.runDomain,
        authenticator,
        dataSyncOf(fixture, parts, observability, config),
        observability.logs,
        observability.metrics,
        fixture.vault
    );
}

export function buildSyncFixture(
    options: Parameters<typeof buildFixture>[0] = {},
    overrides: Partial<ConfigType<typeof bankConnectionsConfig>> = {}
): SyncFixture {
    const fixture: Fixture = buildFixture(options);
    const config: ConfigType<typeof bankConnectionsConfig> = configOf({ ...options.config, ...overrides });
    const observability: SyncObservability = syncObservability();
    const parts: Collaborators = collaboratorsOf(fixture);
    return {
        ...fixture,
        ...parts,
        ...applicationsOf(fixture, parts, observability, config),
        logEntries: observability.logEntries,
        metricEntries: observability.metricEntries,
        config
    };
}

export function connectionOf(fixture: Fixture, index: number = 0): BankConnection {
    const row: BankConnection | undefined = fixture.connections.rows[index];
    if (row === undefined) {
        throw new Error('connection not seeded');
    }
    return row;
}

export { COMPANY_ID };
