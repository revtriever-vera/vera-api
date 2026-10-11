import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { BankConnectionDomain } from '../domain/bank-connection.domain';
import { CredentialsMissingError, InvalidPluggyCredentialsError } from '../domain/bank-connections.errors';
import {
    BankConnection,
    BankSyncRun,
    ConnectionIdentity,
    EMPTY_SYNC_COUNTS,
    SYNC_FAILURE_CODES,
    SYNC_RUN_STATUSES,
    SYNCABLE_CONNECTION_STATUSES,
    SyncCounts,
    SyncFailureCode,
    SyncRunStatus,
    SyncTrigger
} from '../domain/bank-connections.types';
import { SyncRunDomain } from '../domain/sync-run.domain';
import { PluggySession } from '../drivers/pluggy-session';
import { PluggyAuthRejectedError, PluggyUnavailableError } from '../ports/pluggy-client.errors';
import { BankConnectionReaderService } from '../services/bank-connection-reader.service';
import { BankConnectionsLogService } from '../services/bank-connections-log.service';
import { BankConnectionsMetricsService } from '../services/bank-connections-metrics.service';
import { ConnectionDataSyncService, DataPull } from '../services/connection-data-sync.service';
import { PluggyAuthenticatorService } from '../services/pluggy-authenticator.service';
import { SyncRequestedBody, syncRequestedPayloadSchema } from '../validation/bank-connections.schemas';

export interface SyncDirective {
    readonly retryAfterSeconds: number | null;
    readonly failure: unknown;
}

interface SyncOutcome {
    readonly status: SyncRunStatus;
    readonly counts: SyncCounts;
    readonly failureCode: SyncFailureCode | null;
    readonly directive: SyncDirective;
}

const NO_DIRECTIVE: SyncDirective = { retryAfterSeconds: null, failure: null };
const MILLISECONDS: number = 1000;

function isSyncable(connection: BankConnection): boolean {
    return SYNCABLE_CONNECTION_STATUSES.some((status: string): boolean => status === connection.status);
}

function failed(code: SyncFailureCode, directive: SyncDirective = NO_DIRECTIVE): SyncOutcome {
    return { status: SYNC_RUN_STATUSES.failed, counts: EMPTY_SYNC_COUNTS, failureCode: code, directive };
}

function statusOf(pull: DataPull): SyncRunStatus {
    if (pull.failedAccounts === 0) {
        return SYNC_RUN_STATUSES.succeeded;
    }
    return pull.succeededAccounts > 0 ? SYNC_RUN_STATUSES.partial : SYNC_RUN_STATUSES.failed;
}

@Injectable()
export class ConnectionSyncApplication {
    public constructor(
        private readonly reader: BankConnectionReaderService,
        private readonly connections: BankConnectionDomain,
        private readonly runs: SyncRunDomain,
        private readonly authenticator: PluggyAuthenticatorService,
        private readonly data: ConnectionDataSyncService,
        private readonly logs: BankConnectionsLogService,
        private readonly metrics: BankConnectionsMetricsService
    ) {}

    public async handle(payload: unknown): Promise<SyncDirective> {
        const parsed: z.SafeParseReturnType<unknown, SyncRequestedBody> = syncRequestedPayloadSchema.safeParse(payload);
        if (!parsed.success) {
            this.logs.syncInvalidPayload();
            return NO_DIRECTIVE;
        }
        const request: SyncRequestedBody = parsed.data;
        const identity: ConnectionIdentity | null = await this.reader.findByIdAcrossTenants(request.connectionId);
        if (identity === null) {
            this.logs.syncSkipped(request.connectionId, 'connection_not_found');
            return NO_DIRECTIVE;
        }
        if (identity.companyId !== request.companyId) {
            this.logs.syncCompanyMismatch(request.connectionId);
            return NO_DIRECTIVE;
        }
        return this.runAs(identity.companyId, identity.id, request.trigger);
    }

    @AsCompany()
    private async runAs(_companyId: string, connectionId: string, trigger: SyncTrigger): Promise<SyncDirective> {
        const connection: BankConnection | null = await this.connections.find(connectionId);
        if (connection === null || !isSyncable(connection)) {
            this.logs.syncSkipped(connectionId, 'not_syncable');
            return NO_DIRECTIVE;
        }
        const run: BankSyncRun = await this.runs.begin(connection.id, trigger);
        const startedAt: number = Date.now();
        const outcome: SyncOutcome = await this.attempt(connection);
        await this.settle(connection, run, trigger, outcome, Date.now() - startedAt);
        return outcome.directive;
    }

    private async attempt(connection: BankConnection): Promise<SyncOutcome> {
        try {
            return await this.perform(connection);
        } catch (error: unknown) {
            return this.failureOf(error, connection);
        }
    }

    private async perform(connection: BankConnection): Promise<SyncOutcome> {
        const session: PluggySession = await this.authenticator.openSession();
        const pull: DataPull = await this.data.pull(connection, session);
        if (pull.revoked) {
            return failed(SYNC_FAILURE_CODES.itemNotFound);
        }
        const status: SyncRunStatus = statusOf(pull);
        return {
            status,
            counts: pull.counts,
            failureCode: status === SYNC_RUN_STATUSES.succeeded ? null : SYNC_FAILURE_CODES.accountFailed,
            directive: NO_DIRECTIVE
        };
    }

    private async failureOf(error: unknown, connection: BankConnection): Promise<SyncOutcome> {
        if (error instanceof CredentialsMissingError) {
            await this.connections.pause(connection.id, 'credentials_missing');
            return failed(SYNC_FAILURE_CODES.credentialsMissing);
        }
        if (error instanceof InvalidPluggyCredentialsError || error instanceof PluggyAuthRejectedError) {
            await this.connections.pauseSyncable();
            return failed(SYNC_FAILURE_CODES.invalidCredentials);
        }
        if (error instanceof PluggyUnavailableError) {
            const code: SyncFailureCode =
                error.reason === 'rate_limited' ? SYNC_FAILURE_CODES.rateLimited : SYNC_FAILURE_CODES.providerUnavailable;
            return failed(code, { retryAfterSeconds: error.retryAfterSeconds, failure: error });
        }
        return failed(SYNC_FAILURE_CODES.unexpected, { retryAfterSeconds: null, failure: error });
    }

    private async settle(
        connection: BankConnection,
        run: BankSyncRun,
        trigger: SyncTrigger,
        outcome: SyncOutcome,
        durationMs: number
    ): Promise<void> {
        await this.runs.conclude(run.id, outcome.status, outcome.counts, outcome.failureCode);
        await this.connections.recordSync(connection.id, outcome.status !== SYNC_RUN_STATUSES.failed);
        await this.runs.prune(connection.id);
        this.metrics.syncFinished(trigger, outcome.status, durationMs / MILLISECONDS);
        this.metrics.transactionsFetched(outcome.counts.fetched);
        this.logs.syncFinished({
            connectionId: connection.id,
            runId: run.id,
            trigger,
            status: outcome.status,
            ...outcome.counts,
            durationMs,
            failureCode: outcome.failureCode
        });
    }
}
