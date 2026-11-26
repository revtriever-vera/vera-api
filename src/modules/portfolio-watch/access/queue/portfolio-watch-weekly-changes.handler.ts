import { Injectable } from '@nestjs/common';
import { JobMutex } from '../../../../core/queue/job-mutex.decorator';
import { QueueEnvelope, QueueHandlerPort, RunningJob } from '../../../../core/queue/queue.types';
import { RedisConnection } from '../../../../core/queue/redis.connection';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { PortfolioChangesApplication } from '../../application/portfolio-changes.application';
import { weeklyPayloadSchema } from '../../validation/portfolio-watch.schemas';

const UNKNOWN_COMPANY: string = 'unknown';

function companyOf(envelope: unknown): string {
    const companyId: unknown = (envelope as { payload?: { companyId?: unknown } } | null)?.payload?.companyId;
    return typeof companyId === 'string' ? companyId : UNKNOWN_COMPANY;
}

@Injectable()
export class PortfolioWatchWeeklyChangesHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.portfolioWatch;
    public readonly type: string = MESSAGE_TYPES.portfolioWatchWeeklyChangesCompanyRequested;

    public constructor(
        private readonly application: PortfolioChangesApplication,
        public readonly redis: RedisConnection
    ) {
        super();
    }

    @JobMutex({ lockKey: 'portfolio-watch-weekly-changes', identify: companyOf })
    public async handle(envelope: QueueEnvelope, _job?: RunningJob): Promise<void> {
        const parsed: ReturnType<typeof weeklyPayloadSchema.safeParse> = weeklyPayloadSchema.safeParse(envelope.payload);
        if (parsed.success) {
            await this.application.evaluateWeekly(parsed.data.companyId);
        }
    }
}
