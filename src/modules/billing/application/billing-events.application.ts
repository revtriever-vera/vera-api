import { Injectable } from '@nestjs/common';
import { InvalidEventError, WebhookUnauthorizedError } from '../domain/billing-engine.errors';
import { EVENT_STATUSES, RevtrieverEvent } from '../domain/billing.types';
import { RevtrieverEventDomain } from '../domain/revtriever-event.domain';
import { WebhookEvent, webhookEventSchema } from '../validation/revtriever-events.schemas';
import { BillingLogService } from '../services/billing-log.service';
import { BillingMetricsService } from '../services/billing-metrics.service';
import { BillingReplayService } from '../services/billing-replay.service';
import { BillingSweepService } from '../services/billing-sweep.service';
import { eventTypeLabel, RevtrieverEventIngestService } from '../services/revtriever-event-ingest.service';
import { ProcessOutcome, RevtrieverEventProcessor } from '../services/revtriever-event-processor.service';
import { RevtrieverWebhookVerifier, VerificationRefusal } from '../services/revtriever-webhook-verifier.service';

function parsedEvent(rawBody: string): WebhookEvent {
    let json: unknown;
    try {
        json = JSON.parse(rawBody);
    } catch {
        throw new InvalidEventError();
    }
    const parsed: WebhookEvent | undefined = webhookEventSchema.safeParse(json).data;
    if (parsed === undefined) {
        throw new InvalidEventError();
    }
    return parsed;
}

@Injectable()
export class BillingEventsApplication {
    public constructor(
        private readonly verifier: RevtrieverWebhookVerifier,
        private readonly ingestion: RevtrieverEventIngestService,
        private readonly processor: RevtrieverEventProcessor,
        private readonly replays: BillingReplayService,
        private readonly sweeps: BillingSweepService,
        private readonly events: RevtrieverEventDomain,
        private readonly logs: BillingLogService,
        private readonly metrics: BillingMetricsService
    ) {}

    public async receive(token: string, rawBody: string, signature: string | null): Promise<void> {
        const refusal: VerificationRefusal | null = this.verifier.refusalOfEvent(token, rawBody, signature, new Date());
        if (refusal !== null) {
            this.logs.webhookRefused(refusal);
            throw new WebhookUnauthorizedError();
        }
        await this.ingestion.ingest(parsedEvent(rawBody));
    }

    public async process(eventId: string): Promise<void> {
        const row: RevtrieverEvent | null = await this.events.findById(eventId);
        if (row?.status !== EVENT_STATUSES.received) {
            return;
        }
        const outcome: ProcessOutcome = await this.processor.process(row);
        if (outcome.status === EVENT_STATUSES.received) {
            this.metrics.event(eventTypeLabel(row.type), 'deferred');
            this.logs.eventDeferred(eventTypeLabel(row.type), row.externalEventId);
            return;
        }
        await this.events.finish(row.id, outcome.status, outcome.error);
        this.metrics.event(eventTypeLabel(row.type), outcome.status);
        if (outcome.status === EVENT_STATUSES.ignored) {
            this.logs.eventIgnored(eventTypeLabel(row.type), row.externalEventId);
        }
    }

    public async replay(): Promise<number> {
        return this.replays.replay();
    }

    public async reconcile(): Promise<{ checked: number; fixed: number }> {
        return this.replays.reconcile();
    }

    public async sweepStandings(): Promise<number> {
        return this.sweeps.sweep();
    }
}
