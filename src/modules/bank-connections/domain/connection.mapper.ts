import { hintOf } from './client-id-hint';
import {
    BankConnection,
    BankConnectionAccount,
    BankSyncRun,
    ConnectionDetails,
    ConnectionStatus,
    ConnectionView,
    CredentialStatus,
    CredentialsView,
    LastRunView,
    LinkedAccountView,
    PluggyCredential,
    SYNC_RUN_STATUSES
} from './bank-connections.types';

export interface LinkedAccountSource {
    readonly id: string;
    readonly name: string;
    readonly kind: string;
    readonly numberLast4: string | null;
}

function isoOrNull(value: Date | null): string | null {
    return value === null ? null : value.toISOString();
}

export function toCredentialsView(credential: PluggyCredential | null): CredentialsView {
    if (credential === null) {
        return { configured: false, clientIdHint: null, status: null, lastVerifiedAt: null, updatedAt: null };
    }
    return {
        configured: true,
        clientIdHint: credential.clientIdHint,
        status: credential.status as CredentialStatus,
        lastVerifiedAt: credential.lastVerifiedAt.toISOString(),
        updatedAt: credential.updatedAt.toISOString()
    };
}

function toLastRunView(run: BankSyncRun | null): LastRunView | null {
    if (run === null) {
        return null;
    }
    return {
        trigger: run.trigger,
        status: run.status,
        startedAt: run.startedAt.toISOString(),
        finishedAt: isoOrNull(run.finishedAt),
        inserted: run.inserted,
        failureCode: run.failureCode
    };
}

function toLinkedAccounts(
    links: readonly BankConnectionAccount[],
    accounts: ReadonlyMap<string, LinkedAccountSource>
): LinkedAccountView[] {
    return links.flatMap((link: BankConnectionAccount): LinkedAccountView[] => {
        const account: LinkedAccountSource | undefined = accounts.get(link.accountId);
        return account === undefined
            ? []
            : [{ accountId: account.id, name: account.name, kind: account.kind, numberLast4: account.numberLast4 }];
    });
}

export function toConnectionView(details: ConnectionDetails, accounts: ReadonlyMap<string, LinkedAccountSource>): ConnectionView {
    const connection: BankConnection = details.connection;
    return {
        id: connection.id,
        itemIdHint: hintOf(connection.externalItemId),
        connectorName: connection.connectorName,
        status: connection.status as ConnectionStatus,
        statusReason: connection.statusReason,
        consentExpiresAt: isoOrNull(connection.consentExpiresAt),
        lastSyncAt: isoOrNull(connection.lastSyncAt),
        lastSuccessAt: isoOrNull(connection.lastSuccessAt),
        syncing: details.lastRun?.status === SYNC_RUN_STATUSES.running,
        accounts: toLinkedAccounts(details.links, accounts),
        lastRun: toLastRunView(details.lastRun)
    };
}
