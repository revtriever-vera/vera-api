import { Insertable, Selectable } from 'kysely';
import { BankConnectionAccounts, BankConnections, BankSyncRuns, PluggyCredentials } from '../../../core/database/generated/database.types';

export type PluggyCredential = Selectable<PluggyCredentials>;
export type NewPluggyCredential = Insertable<PluggyCredentials>;
export type BankConnection = Selectable<BankConnections>;
export type NewBankConnection = Insertable<BankConnections>;
export type BankConnectionAccount = Selectable<BankConnectionAccounts>;
export type BankSyncRun = Selectable<BankSyncRuns>;

export const PLUGGY_PROVIDER: string = 'pluggy';
export const PLUGGY_CREDENTIALS_PURPOSE: string = 'pluggy-credentials';
export const MAX_ACTIVE_CONNECTIONS: number = 20;
export const MAX_ITEM_IDS_PER_REQUEST: number = 10;
export const CONNECTION_LIST_LIMIT: number = 100;
export const HINT_EDGE_LENGTH: number = 4;

export const CREDENTIAL_STATUSES = {
    valid: 'valid',
    invalid: 'invalid'
} as const;

export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[keyof typeof CREDENTIAL_STATUSES];

export const CONNECTION_STATUSES = {
    active: 'active',
    needsAttention: 'needs_attention',
    revoked: 'revoked',
    paused: 'paused',
    disconnected: 'disconnected'
} as const;

export type ConnectionStatus = (typeof CONNECTION_STATUSES)[keyof typeof CONNECTION_STATUSES];

export const SYNCABLE_CONNECTION_STATUSES: readonly ConnectionStatus[] = [CONNECTION_STATUSES.active, CONNECTION_STATUSES.needsAttention];

export const STATUS_REASONS = {
    loginError: 'login_error',
    outdated: 'outdated',
    waitingUserInput: 'waiting_user_input',
    itemNotFound: 'item_not_found',
    credentialsInvalid: 'credentials_invalid'
} as const;

export type StatusReason = (typeof STATUS_REASONS)[keyof typeof STATUS_REASONS];

export const SYNC_TRIGGERS = {
    initial: 'initial',
    daily: 'daily',
    manual: 'manual',
    credentialsRotated: 'credentials_rotated'
} as const;

export type SyncTrigger = (typeof SYNC_TRIGGERS)[keyof typeof SYNC_TRIGGERS];

export const SYNC_RUN_STATUSES = {
    running: 'running',
    succeeded: 'succeeded',
    partial: 'partial',
    failed: 'failed'
} as const;

export const ITEM_OUTCOMES = {
    connected: 'connected',
    alreadyConnected: 'already_connected',
    notFound: 'not_found',
    limitReached: 'limit_reached',
    failed: 'failed'
} as const;

export type ItemOutcome = (typeof ITEM_OUTCOMES)[keyof typeof ITEM_OUTCOMES];

export const CREDENTIAL_ACTIONS = {
    saved: 'saved',
    rotated: 'rotated',
    tested: 'tested',
    removed: 'removed',
    rejected: 'rejected'
} as const;

export type CredentialAction = (typeof CREDENTIAL_ACTIONS)[keyof typeof CREDENTIAL_ACTIONS];

export interface SyncRequestedPayload {
    readonly connectionId: string;
    readonly companyId: string;
    readonly trigger: SyncTrigger;
}

export interface CredentialsView {
    readonly configured: boolean;
    readonly clientIdHint: string | null;
    readonly status: CredentialStatus | null;
    readonly lastVerifiedAt: string | null;
    readonly updatedAt: string | null;
}

export interface LinkedAccountView {
    readonly accountId: string;
    readonly name: string;
    readonly kind: string;
    readonly numberLast4: string | null;
}

export interface LastRunView {
    readonly trigger: string;
    readonly status: string;
    readonly startedAt: string;
    readonly finishedAt: string | null;
    readonly inserted: number;
    readonly failureCode: string | null;
}

export interface ConnectionView {
    readonly id: string;
    readonly itemIdHint: string;
    readonly connectorName: string | null;
    readonly status: ConnectionStatus;
    readonly statusReason: string | null;
    readonly consentExpiresAt: string | null;
    readonly lastSyncAt: string | null;
    readonly lastSuccessAt: string | null;
    readonly syncing: boolean;
    readonly accounts: readonly LinkedAccountView[];
    readonly lastRun: LastRunView | null;
}

export interface ItemResultView {
    readonly itemIdHint: string;
    readonly outcome: ItemOutcome;
    readonly connection: ConnectionView | null;
}

export interface ConnectionDraft {
    readonly externalItemId: string;
    readonly connectorName: string | null;
    readonly status: ConnectionStatus;
    readonly statusReason: StatusReason | null;
    readonly providerStatus: string | null;
    readonly consentExpiresAt: Date | null;
}

export interface ConnectionIdentity {
    readonly id: string;
    readonly companyId: string;
}

export interface ConnectionDetails {
    readonly connection: BankConnection;
    readonly links: readonly BankConnectionAccount[];
    readonly lastRun: BankSyncRun | null;
}
