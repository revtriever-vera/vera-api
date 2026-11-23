import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { PlanGateService } from '../../plans/services/plan-gate.service';
import { LinkContact, LinkContactService } from '../../whatsapp-link/services/link-contact.service';
import { ReminderDomain } from '../domain/reminder.domain';
import {
    CHANNELS,
    MISS_REASONS,
    MissReason,
    OCCURRENCE_KINDS,
    OCCURRENCE_STATUSES,
    OccurrenceStatus,
    REMINDER_STATUSES,
    Reminder,
    ReminderOccurrence,
    UNREACHED_REASONS
} from '../domain/reminders.types';
import { DeliveryOutcome, ReminderDeliveryService } from '../services/reminder-delivery.service';
import { ReminderEngineService } from '../services/reminder-engine.service';
import { RemindersLogService } from '../services/reminders-log.service';
import { RemindersMetricsService } from '../services/reminders-metrics.service';

const GATE_AVAILABLE: string = 'available';
const GATE_PAUSED: string = 'paused';

@Injectable()
export class ReminderFireApplication {
    public constructor(
        private readonly domain: ReminderDomain,
        private readonly engine: ReminderEngineService,
        private readonly delivery: ReminderDeliveryService,
        private readonly gate: PlanGateService,
        private readonly links: LinkContactService,
        private readonly logs: RemindersLogService,
        private readonly metrics: RemindersMetricsService
    ) {}

    @UsingTransaction()
    public async fire(occurrenceId: string, now: Date = new Date()): Promise<void> {
        const occurrence: ReminderOccurrence | null = await this.domain.claim(occurrenceId);
        if (occurrence === null) {
            return;
        }
        const reminder: Reminder | null = await this.domain.byId(occurrence.reminderId);
        if (reminder === null || !this.isLive(reminder, occurrence)) {
            await this.domain.settle(occurrence.id, OCCURRENCE_STATUSES.sending, { status: OCCURRENCE_STATUSES.canceled });
            return;
        }
        await this.engine.advance(reminder, occurrence, now);
        await this.settle(occurrence, OCCURRENCE_STATUSES.sending, await this.outcomeOf(reminder, occurrence, now));
    }

    @UsingTransaction()
    public async onOutboundFailed(messageId: string, now: Date = new Date()): Promise<void> {
        const occurrence: ReminderOccurrence | null = await this.domain.occurrenceOfMessage(messageId);
        if (occurrence?.status !== OCCURRENCE_STATUSES.sent) {
            return;
        }
        const reminder: Reminder | null = await this.domain.byId(occurrence.reminderId);
        const linkId: string | null = reminder?.linkId ?? null;
        const contact: LinkContact | null = linkId === null ? null : await this.links.contactOf(linkId);
        if (reminder === null || contact === null || occurrence.channel === CHANNELS.template) {
            await this.settle(occurrence, OCCURRENCE_STATUSES.sent, { kind: 'unreached', reason: UNREACHED_REASONS.sendFailed });
            return;
        }
        await this.settle(occurrence, OCCURRENCE_STATUSES.sent, await this.delivery.deliverTemplate(reminder, occurrence, contact, now));
    }

    private async outcomeOf(reminder: Reminder, occurrence: ReminderOccurrence, now: Date): Promise<DeliveryOutcome> {
        const state: string = await this.gate.stateOf('whatsapp');
        if (state !== GATE_AVAILABLE && state !== GATE_PAUSED) {
            return { kind: 'missed', reason: this.reasonOf(state) };
        }
        const contact: LinkContact | null = reminder.linkId === null ? null : await this.links.contactOf(reminder.linkId);
        if (contact === null) {
            return { kind: 'unreached', reason: UNREACHED_REASONS.noLink };
        }
        if (state === GATE_PAUSED) {
            return this.delivery.deliverWithoutCost(reminder, contact, now);
        }
        return this.delivery.deliver(reminder, occurrence, contact, now);
    }

    private async settle(occurrence: ReminderOccurrence, from: OccurrenceStatus, outcome: DeliveryOutcome): Promise<void> {
        if (outcome.kind === 'sent') {
            await this.domain.settle(occurrence.id, from, {
                status: OCCURRENCE_STATUSES.sent,
                channel: outcome.channel,
                messageId: outcome.messageId
            });
            this.logs.fired(outcome.channel);
            this.metrics.fired(outcome.channel);
            return;
        }
        if (outcome.kind === 'missed') {
            await this.domain.settle(occurrence.id, from, { status: OCCURRENCE_STATUSES.missed });
            this.logs.missed(outcome.reason);
            this.metrics.missed(outcome.reason);
            return;
        }
        await this.domain.settle(occurrence.id, from, { status: OCCURRENCE_STATUSES.unreached });
        this.logs.unreached(outcome.reason);
    }

    private isLive(reminder: Reminder, occurrence: ReminderOccurrence): boolean {
        if (reminder.status === REMINDER_STATUSES.active) {
            return true;
        }
        return occurrence.kind === OCCURRENCE_KINDS.snooze && reminder.status === REMINDER_STATUSES.done;
    }

    private reasonOf(state: string): MissReason {
        return state === GATE_PAUSED ? MISS_REASONS.paused : MISS_REASONS.premium;
    }
}
