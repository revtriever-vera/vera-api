import { Injectable } from '@nestjs/common';
import { QueuePublisherPort } from '../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES } from '../../../shared/constants/queues.constants';

const MS_PER_DAY: number = 86_400_000;

function previousDay(day: string): string {
    return new Date(Date.parse(`${day}T00:00:00Z`) - MS_PER_DAY).toISOString().slice(0, 10);
}

export interface EvaluatePayloadMessage {
    readonly companyId: string;
}

export function evaluateJobId(companyId: string, day: string): string {
    return `goal-notices-${companyId}-${day}`;
}

@Injectable()
export class GoalNoticesPublisherService {
    public constructor(private readonly publisher: QueuePublisherPort) {}

    public async request(companyId: string, day: string): Promise<void> {
        const payload: EvaluatePayloadMessage = { companyId };
        await this.publisher.publish(QUEUES.goalNotices, MESSAGE_TYPES.goalNoticesEvaluateRequested, payload, {
            jobId: evaluateJobId(companyId, day)
        });
    }

    public async cancel(companyId: string, day: string): Promise<void> {
        for (const at of [previousDay(day), day]) {
            await this.publisher.remove(QUEUES.goalNotices, evaluateJobId(companyId, at));
        }
    }
}
