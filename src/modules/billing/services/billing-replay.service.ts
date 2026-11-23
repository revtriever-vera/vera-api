import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
import { EngineEvent, EngineEventPage, EngineInvoice } from '../domain/billing-engine.types';
import { BillingInvoiceDomain } from '../domain/billing-invoice.domain';
import { advancedInvoiceStatus, isInvoiceStatus } from '../domain/billing-invoice.rules';
import {
    BillingInvoice,
    EVENT_STALE_MINUTES,
    EVENTS_CURSOR_SOURCE,
    INVOICE_STATUSES,
    InvoiceRowStatus,
    RevtrieverEvent,
    SWEEP_BATCH
} from '../domain/billing.types';
import { RevtrieverEventCursorDomain } from '../domain/revtriever-event-cursor.domain';
import { RevtrieverEventDomain } from '../domain/revtriever-event.domain';
import { BillingEnginePort } from '../ports/billing-engine.port';
import { WebhookEvent } from '../validation/revtriever-events.schemas';
import { BillingLogService } from './billing-log.service';
import { RevtrieverEventIngestService } from './revtriever-event-ingest.service';

const REPLAY_PAGE_SIZE: number = 100;
const REPLAY_MAX_PAGES: number = 20;
const REPUBLISH_BATCH: number = 200;

function webhookEventOf(event: EngineEvent): WebhookEvent {
    return { id: event.id, type: event.type, occurredAt: event.createdAt, data: { ...event.data } };
}

@Injectable()
export class BillingReplayService {
    public constructor(
        private readonly engine: BillingEnginePort,
        private readonly ingestion: RevtrieverEventIngestService,
        private readonly events: RevtrieverEventDomain,
        private readonly cursors: RevtrieverEventCursorDomain,
        private readonly invoices: BillingInvoiceDomain,
        private readonly logs: BillingLogService
    ) {}

    public async replay(): Promise<number> {
        const ingested: number = await this.pullFromCursor();
        const stalled: RevtrieverEvent[] = await this.events.listStalledReceived(
            DateUtil.addMinutes(new Date(), -EVENT_STALE_MINUTES),
            REPUBLISH_BATCH
        );
        for (const event of stalled) {
            await this.ingestion.publish(event, true);
        }
        return ingested + stalled.length;
    }

    public async reconcile(): Promise<{ checked: number; fixed: number }> {
        const open: BillingInvoice[] = await this.invoices.listOpenAcrossTenants(SWEEP_BATCH);
        let fixed: number = 0;
        for (const local of open) {
            fixed += (await this.reconcileOne(local)) ? 1 : 0;
        }
        this.logs.reconciled(open.length, fixed);
        return { checked: open.length, fixed };
    }

    private async pullFromCursor(): Promise<number> {
        let cursor: string | null = await this.cursors.cursorOf(EVENTS_CURSOR_SOURCE);
        let ingested: number = 0;
        for (let pages: number = 0; pages < REPLAY_MAX_PAGES; pages += 1) {
            const page: EngineEventPage = await this.engine.eventsAfter(cursor, REPLAY_PAGE_SIZE);
            ingested += await this.ingestAll(page.items);
            if (page.next === null) {
                return ingested;
            }
            cursor = page.next;
            await this.cursors.save(EVENTS_CURSOR_SOURCE, cursor);
        }
        return ingested;
    }

    private async ingestAll(items: readonly EngineEvent[]): Promise<number> {
        let ingested: number = 0;
        for (const event of items) {
            ingested += (await this.ingestion.ingest(webhookEventOf(event))) ? 1 : 0;
        }
        return ingested;
    }

    private async reconcileOne(local: BillingInvoice): Promise<boolean> {
        const remote: EngineInvoice | null = await this.remoteOf(local);
        if (remote === null || !isInvoiceStatus(remote.status)) {
            return false;
        }
        const status: InvoiceRowStatus = remote.status;
        if (advancedInvoiceStatus(isInvoiceStatus(local.status) ? local.status : INVOICE_STATUSES.issued, status) === local.status) {
            return false;
        }
        return this.ingestion.ingest({
            id: `reconciliation-${local.engineInvoiceId}-${status}`,
            type: status === INVOICE_STATUSES.paid ? 'invoice.paid' : 'invoice.overdue',
            occurredAt: new Date().toISOString(),
            data: {
                invoiceId: local.engineInvoiceId,
                subscriptionId: remote.subscriptionId,
                totalCents: remote.totalCents,
                paidAt: remote.paidAt
            }
        });
    }

    private async remoteOf(local: BillingInvoice): Promise<EngineInvoice | null> {
        try {
            return await this.engine.invoiceOf(local.engineInvoiceId);
        } catch {
            return null;
        }
    }
}
