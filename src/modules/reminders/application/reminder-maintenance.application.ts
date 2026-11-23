import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { ReminderDomain } from '../domain/reminder.domain';
import {
    DueOccurrenceRef,
    MISS_REASONS,
    OCCURRENCE_STATUSES,
    REMINDER_STATUSES,
    Reminder,
    ReminderOccurrence,
    STALE_AFTER_MS,
    SWEEP_BATCH,
    SWEEP_GRACE_MS
} from '../domain/reminders.types';
import { ReminderEngineService } from '../services/reminder-engine.service';
import { RemindersLogService } from '../services/reminders-log.service';
import { RemindersMetricsService } from '../services/reminders-metrics.service';

@Injectable()
export class ReminderMaintenanceApplication {
    public constructor(
        private readonly domain: ReminderDomain,
        private readonly engine: ReminderEngineService,
        private readonly logs: RemindersLogService,
        private readonly metrics: RemindersMetricsService
    ) {}

    public async sweep(now: Date = new Date()): Promise<void> {
        const due: DueOccurrenceRef[] = await this.domain.dueAcrossTenants(new Date(now.getTime() - SWEEP_GRACE_MS), SWEEP_BATCH);
        let requeued: number = 0;
        let missed: number = 0;
        for (const ref of due) {
            if (now.getTime() - ref.occurrenceAt.getTime() > STALE_AFTER_MS) {
                missed += (await this.expire(ref.companyId, ref.id, now)) ? 1 : 0;
                continue;
            }
            requeued += (await this.requeue(ref.companyId, ref.id, now)) ? 1 : 0;
        }
        if (requeued + missed > 0) {
            this.logs.sweepRequeued(requeued, missed);
        }
    }

    public async publishGauge(): Promise<void> {
        this.metrics.active(await this.domain.countActiveAcrossTenants());
    }

    @AsCompany()
    private async requeue(_companyId: string, occurrenceId: string, now: Date): Promise<boolean> {
        const occurrence: ReminderOccurrence | null = await this.domain.occurrence(occurrenceId);
        if (occurrence?.status !== OCCURRENCE_STATUSES.scheduled) {
            return false;
        }
        await this.engine.publish(occurrence, now);
        return true;
    }

    @AsCompany()
    @UsingTransaction()
    private async expire(_companyId: string, occurrenceId: string, now: Date): Promise<boolean> {
        const occurrence: ReminderOccurrence | null = await this.domain.claim(occurrenceId);
        if (occurrence === null) {
            return false;
        }
        const reminder: Reminder | null = await this.domain.byId(occurrence.reminderId);
        if (reminder?.status === REMINDER_STATUSES.active) {
            await this.engine.advance(reminder, occurrence, now);
        }
        await this.domain.settle(occurrence.id, OCCURRENCE_STATUSES.sending, { status: OCCURRENCE_STATUSES.missed });
        this.logs.missed(MISS_REASONS.stale);
        this.metrics.missed(MISS_REASONS.stale);
        return true;
    }
}
