import { Injectable } from '@nestjs/common';
import { QueuePublisherPort } from '../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES } from '../../../shared/constants/queues.constants';
import { DETECT_WINDOW_MS } from '../domain/recurring-series.types';

export interface DetectPayload {
    readonly companyId: string;
}

export function detectJobId(companyId: string, now: number): string {
    return `recurring-detect-${companyId}-${String(Math.floor(now / DETECT_WINDOW_MS))}`;
}

export function untilWindowEnd(now: number): number {
    return DETECT_WINDOW_MS - (now % DETECT_WINDOW_MS);
}

@Injectable()
export class RecurringDetectPublisherService {
    public constructor(private readonly publisher: QueuePublisherPort) {}

    public async request(companyId: string, now: number = Date.now()): Promise<void> {
        const payload: DetectPayload = { companyId };
        await this.publisher.publish(QUEUES.recurring, MESSAGE_TYPES.recurringDetectRequested, payload, {
            jobId: detectJobId(companyId, now),
            delayMs: untilWindowEnd(now)
        });
    }

    public async cancel(companyId: string, now: number = Date.now()): Promise<void> {
        for (const at of [now, now + DETECT_WINDOW_MS]) {
            await this.publisher.remove(QUEUES.recurring, detectJobId(companyId, at));
        }
    }
}
