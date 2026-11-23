import { Injectable } from '@nestjs/common';
import { JobMutex } from '../../../../core/queue/job-mutex.decorator';
import { QueueEnvelope, QueueHandlerPort, RunningJob } from '../../../../core/queue/queue.types';
import { RedisConnection } from '../../../../core/queue/redis.connection';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { RecurringDetectionApplication } from '../../application/recurring-detection.application';
import { detectPayloadSchema } from '../../validation/recurring.schemas';

const UNKNOWN_COMPANY: string = 'unknown';

function companyOf(envelope: unknown): string {
    const companyId: unknown = (envelope as { payload?: { companyId?: unknown } } | null)?.payload?.companyId;
    return typeof companyId === 'string' ? companyId : UNKNOWN_COMPANY;
}

@Injectable()
export class RecurringDetectHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.recurring;
    public readonly type: string = MESSAGE_TYPES.recurringDetectRequested;

    public constructor(
        private readonly application: RecurringDetectionApplication,
        public readonly redis: RedisConnection
    ) {
        super();
    }

    @JobMutex({ lockKey: 'recurring-detect', identify: companyOf })
    public async handle(envelope: QueueEnvelope, _job?: RunningJob): Promise<void> {
        const parsed: ReturnType<typeof detectPayloadSchema.safeParse> = detectPayloadSchema.safeParse(envelope.payload);
        if (parsed.success) {
            await this.application.detect(parsed.data.companyId);
        }
    }
}
