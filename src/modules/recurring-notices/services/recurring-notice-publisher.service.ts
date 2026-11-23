import { Injectable } from '@nestjs/common';
import { QueuePublisherPort } from '../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES } from '../../../shared/constants/queues.constants';

export interface SchedulePayload {
    readonly companyId: string;
}

export interface WeekPayload {
    readonly companyId: string;
    readonly monday: string;
}

export interface DuePayload {
    readonly companyId: string;
    readonly seriesId: string;
    readonly userId: string;
    readonly date: string;
}

export function scheduleJobId(companyId: string, day: string): string {
    return `recurring-notices-schedule-${companyId}-${day}`;
}

export function weekJobId(companyId: string, monday: string): string {
    return `recurring-week-${companyId}-${monday}`;
}

export function dueJobId(payload: DuePayload): string {
    return `recurring-due-${payload.seriesId}-${payload.userId}-${payload.date}`;
}

@Injectable()
export class RecurringNoticePublisherService {
    public constructor(private readonly publisher: QueuePublisherPort) {}

    public async requestSchedule(companyId: string, day: string): Promise<void> {
        const payload: SchedulePayload = { companyId };
        await this.publisher.publish(QUEUES.recurringNotices, MESSAGE_TYPES.recurringNoticesScheduleRequested, payload, {
            jobId: scheduleJobId(companyId, day)
        });
    }

    public async queueWeek(payload: WeekPayload, at: Date, now: Date): Promise<void> {
        await this.publisher.publish(QUEUES.recurringNotices, MESSAGE_TYPES.recurringWeekDue, payload, {
            jobId: weekJobId(payload.companyId, payload.monday),
            delayMs: Math.max(0, at.getTime() - now.getTime())
        });
    }

    public async queueDue(payload: DuePayload, at: Date, now: Date): Promise<void> {
        await this.publisher.publish(QUEUES.recurringNotices, MESSAGE_TYPES.recurringDueDue, payload, {
            jobId: dueJobId(payload),
            delayMs: Math.max(0, at.getTime() - now.getTime())
        });
    }

    public async cancel(jobIds: readonly string[]): Promise<void> {
        for (const jobId of jobIds) {
            await this.publisher.remove(QUEUES.recurringNotices, jobId);
        }
    }
}
