import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { BankConnectionDomain, Registration } from '../domain/bank-connection.domain';
import {
    BankConnection,
    ConnectionDraft,
    ConnectionView,
    ITEM_OUTCOMES,
    ItemOutcome,
    ItemResultView,
    SYNC_TRIGGERS
} from '../domain/bank-connections.types';
import { hintOf } from '../domain/client-id-hint';
import { draftOfItem } from '../domain/connection-status';
import { PluggySession } from '../drivers/pluggy-session';
import { PluggyAuthRejectedError, PluggyNotFoundError, PluggyUnavailableError } from '../ports/pluggy-client.errors';
import { PluggyClientPort, PluggyItem } from '../ports/pluggy-client.port';
import { BankConnectionsLogService } from './bank-connections-log.service';
import { BankSyncPublisherService } from './bank-sync-publisher.service';
import { ConnectionViewService } from './connection-view.service';

interface ResolvedItem {
    readonly itemId: string;
    readonly outcome: ItemOutcome;
    readonly connection: BankConnection | null;
}

interface Inspection {
    readonly itemId: string;
    readonly existing: BankConnection | null;
    readonly draft: ConnectionDraft | null;
    readonly failure: ItemOutcome | null;
}

function isPluggyFailure(error: unknown): boolean {
    return error instanceof PluggyUnavailableError || error instanceof PluggyAuthRejectedError || error instanceof PluggyNotFoundError;
}

@Injectable()
export class ItemRegistrationService {
    public constructor(
        private readonly client: PluggyClientPort,
        private readonly connections: BankConnectionDomain,
        private readonly views: ConnectionViewService,
        private readonly sync: BankSyncPublisherService,
        private readonly logs: BankConnectionsLogService
    ) {}

    public async register(session: PluggySession, itemIds: readonly string[]): Promise<ItemResultView[]> {
        const known: BankConnection[] = await this.connections.findExisting(itemIds);
        const inspections: Inspection[] = await this.inspectAll(session, itemIds, known);
        const registrations: Registration[] = await this.persist(inspections);
        await this.sync.publishAll(this.createdIds(registrations), SYNC_TRIGGERS.initial);
        return this.resultsOf(inspections, registrations);
    }

    @UsingTransaction()
    private async persist(inspections: readonly Inspection[]): Promise<Registration[]> {
        const drafts: ConnectionDraft[] = inspections.flatMap((inspection: Inspection): ConnectionDraft[] =>
            inspection.draft === null ? [] : [inspection.draft]
        );
        return this.connections.registerAll(drafts);
    }

    private async inspectAll(session: PluggySession, itemIds: readonly string[], known: readonly BankConnection[]): Promise<Inspection[]> {
        const byItem: Map<string, BankConnection> = new Map<string, BankConnection>(
            known.map((connection: BankConnection): [string, BankConnection] => [connection.externalItemId, connection])
        );
        const inspections: Inspection[] = [];
        for (const itemId of itemIds) {
            inspections.push(await this.inspect(session, itemId, byItem.get(itemId) ?? null));
        }
        return inspections;
    }

    private async inspect(session: PluggySession, itemId: string, existing: BankConnection | null): Promise<Inspection> {
        if (existing !== null) {
            return { itemId, existing, draft: null, failure: null };
        }
        try {
            const item: PluggyItem | null = await this.client.getItem(session, itemId);
            return item === null
                ? { itemId, existing: null, draft: null, failure: ITEM_OUTCOMES.notFound }
                : { itemId, existing: null, draft: { ...draftOfItem(item), externalItemId: itemId }, failure: null };
        } catch (error: unknown) {
            if (!isPluggyFailure(error)) {
                throw error;
            }
            return { itemId, existing: null, draft: null, failure: ITEM_OUTCOMES.failed };
        }
    }

    private createdIds(registrations: readonly Registration[]): string[] {
        return registrations.flatMap((registration: Registration): string[] =>
            registration.outcome === ITEM_OUTCOMES.connected && registration.connection !== null ? [registration.connection.id] : []
        );
    }

    private async resultsOf(inspections: readonly Inspection[], registrations: readonly Registration[]): Promise<ItemResultView[]> {
        const registered: Map<string, Registration> = new Map<string, Registration>(
            registrations.map((registration: Registration): [string, Registration] => [registration.externalItemId, registration])
        );
        const resolved: ResolvedItem[] = inspections.map((inspection: Inspection): ResolvedItem =>
            this.resolve(inspection, registered.get(inspection.itemId))
        );
        const views: Map<string, ConnectionView> = await this.viewsById(
            resolved.map((entry: ResolvedItem): BankConnection | null => entry.connection)
        );
        return resolved.map((entry: ResolvedItem): ItemResultView => {
            this.logs.item(entry.connection?.id ?? null, entry.outcome, entry.connection?.providerStatus ?? null);
            return {
                itemIdHint: hintOf(entry.itemId),
                outcome: entry.outcome,
                connection: entry.connection === null ? null : (views.get(entry.connection.id) ?? null)
            };
        });
    }

    private resolve(inspection: Inspection, registration: Registration | undefined): ResolvedItem {
        if (inspection.existing !== null) {
            return { itemId: inspection.itemId, outcome: ITEM_OUTCOMES.alreadyConnected, connection: inspection.existing };
        }
        if (inspection.failure !== null || registration === undefined) {
            return { itemId: inspection.itemId, outcome: inspection.failure ?? ITEM_OUTCOMES.failed, connection: null };
        }
        return { itemId: inspection.itemId, outcome: registration.outcome, connection: registration.connection };
    }

    private async viewsById(connections: readonly (BankConnection | null)[]): Promise<Map<string, ConnectionView>> {
        const present: BankConnection[] = connections.flatMap((connection: BankConnection | null): BankConnection[] =>
            connection === null ? [] : [connection]
        );
        const views: ConnectionView[] = await this.views.viewsOf(present);
        return new Map<string, ConnectionView>(views.map((view: ConnectionView): [string, ConnectionView] => [view.id, view]));
    }
}
