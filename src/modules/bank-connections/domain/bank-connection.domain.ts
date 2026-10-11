import { Injectable } from '@nestjs/common';
import { BankConnectionAccountsRepository } from '../repositories/bank-connection-accounts.repository';
import { BankConnectionsRepository } from '../repositories/bank-connections.repository';
import { BankSyncRunsRepository } from '../repositories/bank-sync-runs.repository';
import { ConnectionNotFoundError } from './bank-connections.errors';
import {
    BankConnection,
    BankConnectionAccount,
    BankSyncRun,
    ConnectionDetails,
    ConnectionDraft,
    ConnectionIdentity,
    ITEM_OUTCOMES,
    ItemOutcome,
    MAX_ACTIVE_CONNECTIONS
} from './bank-connections.types';

export interface Registration {
    readonly externalItemId: string;
    readonly outcome: ItemOutcome;
    readonly connection: BankConnection | null;
}

export interface Disconnection {
    readonly connections: readonly BankConnection[];
    readonly accountIds: readonly string[];
}

function groupByConnection(links: readonly BankConnectionAccount[]): Map<string, BankConnectionAccount[]> {
    const grouped: Map<string, BankConnectionAccount[]> = new Map<string, BankConnectionAccount[]>();
    for (const link of links) {
        grouped.set(link.connectionId, [...(grouped.get(link.connectionId) ?? []), link]);
    }
    return grouped;
}

@Injectable()
export class BankConnectionDomain {
    public constructor(
        private readonly connections: BankConnectionsRepository,
        private readonly links: BankConnectionAccountsRepository,
        private readonly runs: BankSyncRunsRepository
    ) {}

    public async listDetails(): Promise<ConnectionDetails[]> {
        return this.detailsOf(await this.connections.listAll());
    }

    public async detailsOf(connections: readonly BankConnection[]): Promise<ConnectionDetails[]> {
        const ids: string[] = connections.map((connection: BankConnection): string => connection.id);
        const links: Map<string, BankConnectionAccount[]> = groupByConnection(await this.links.listByConnections(ids));
        const runs: Map<string, BankSyncRun> = new Map<string, BankSyncRun>(
            (await this.runs.latestByConnections(ids)).map((run: BankSyncRun): [string, BankSyncRun] => [run.connectionId, run])
        );
        return connections.map((connection: BankConnection): ConnectionDetails => ({
            connection,
            links: links.get(connection.id) ?? [],
            lastRun: runs.get(connection.id) ?? null
        }));
    }

    public async findExisting(externalItemIds: readonly string[]): Promise<BankConnection[]> {
        return this.connections.findByExternalItemIds(externalItemIds);
    }

    public async registerAll(drafts: readonly ConnectionDraft[]): Promise<Registration[]> {
        let total: number = await this.connections.countAll();
        const registrations: Registration[] = [];
        for (const draft of drafts) {
            const registration: Registration = await this.register(draft, total);
            total += registration.outcome === ITEM_OUTCOMES.connected ? 1 : 0;
            registrations.push(registration);
        }
        return registrations;
    }

    public async resumePaused(): Promise<BankConnection[]> {
        return this.connections.resumePaused();
    }

    public async disconnectAll(): Promise<Disconnection> {
        return this.unlinkAfter(await this.connections.disconnectAll());
    }

    public async disconnect(id: string): Promise<Disconnection> {
        const disconnected: BankConnection | null = await this.connections.disconnectOne(id);
        if (disconnected === null) {
            throw new ConnectionNotFoundError(id);
        }
        return this.unlinkAfter([disconnected]);
    }

    public async listSyncableAcrossTenants(): Promise<ConnectionIdentity[]> {
        return this.connections.listSyncableAcrossTenants();
    }

    public async findIdentityAcrossTenants(id: string): Promise<ConnectionIdentity | null> {
        return this.connections.findIdentityAcrossTenants(id);
    }

    public async countAll(): Promise<number> {
        return this.connections.countAll();
    }

    public async countConnected(): Promise<number> {
        return this.connections.countConnected();
    }

    private async register(draft: ConnectionDraft, total: number): Promise<Registration> {
        if (total >= MAX_ACTIVE_CONNECTIONS) {
            return { externalItemId: draft.externalItemId, outcome: ITEM_OUTCOMES.limitReached, connection: null };
        }
        const created: BankConnection | null = await this.connections.insertIfAbsent(draft);
        if (created !== null) {
            return { externalItemId: draft.externalItemId, outcome: ITEM_OUTCOMES.connected, connection: created };
        }
        const [existing] = await this.connections.findByExternalItemIds([draft.externalItemId]);
        return { externalItemId: draft.externalItemId, outcome: ITEM_OUTCOMES.alreadyConnected, connection: existing ?? null };
    }

    private async unlinkAfter(connections: readonly BankConnection[]): Promise<Disconnection> {
        const links: BankConnectionAccount[] = await this.links.unlinkConnections(
            connections.map((connection: BankConnection): string => connection.id)
        );
        return { connections, accountIds: [...new Set<string>(links.map((link: BankConnectionAccount): string => link.accountId))] };
    }
}
