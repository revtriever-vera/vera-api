import { Injectable } from '@nestjs/common';
import { QueuePublisherPort } from '../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES } from '../../../shared/constants/queues.constants';
import { RevtrieverEventDomain } from '../domain/revtriever-event.domain';
import { RevtrieverEvent } from '../domain/billing.types';
import { WebhookEvent } from '../validation/revtriever-events.schemas';
import { BillingLogService } from './billing-log.service';
import { BillingMetricsService } from './billing-metrics.service';

export function eventTypeLabel(type: string): string {
    return KNOWN_TYPES.has(type) ? type : 'other';
}

const KNOWN_TYPES: ReadonlySet<string> = new Set([
    'invoice.issued',
    'invoice.overdue',
    'invoice.paid',
    'invoice.held',
    'charge.failed',
    'subscription.canceled',
    'subscription.card_saved',
    'pricing.failing',
    'pricing.recovered'
]);

@Injectable()
export class RevtrieverEventIngestService {
    public constructor(
        private readonly events: RevtrieverEventDomain,
        private readonly publisher: QueuePublisherPort,
        private readonly logs: BillingLogService,
        private readonly metrics: BillingMetricsService
    ) {}

    public async ingest(event: WebhookEvent): Promise<boolean> {
        const stored: RevtrieverEvent | null = await this.events.insertOnce({
            externalEventId: event.id,
            type: event.type,
            payload: event
        });
        if (stored === null) {
            return false;
        }
        this.logs.eventReceived(eventTypeLabel(event.type), event.id);
        this.metrics.event(eventTypeLabel(event.type), 'received');
        await this.publish(stored, false);
        return true;
    }

    public async publish(event: RevtrieverEvent, republish: boolean): Promise<void> {
        await this.publisher.publish(
            QUEUES.billing,
            MESSAGE_TYPES.billingRevtrieverEventReceived,
            { eventId: event.id },
            { jobId: `revtriever-event-${event.id}`, replaceExisting: republish }
        );
    }
}
