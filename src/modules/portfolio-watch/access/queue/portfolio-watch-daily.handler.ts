import { Injectable } from '@nestjs/common';
import { JobMutex } from '../../../../core/queue/job-mutex.decorator';
import { QueueEnvelope, QueueHandlerPort, RunningJob } from '../../../../core/queue/queue.types';
import { RedisConnection } from '../../../../core/queue/redis.connection';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { PortfolioWatchDailyApplication } from '../../application/portfolio-watch-daily.application';
import { dailyPayloadSchema } from '../../validation/portfolio-watch.schemas';

const UNKNOWN_COMPANY: string = 'unknown';

function companyOf(envelope: unknown): string {
    const companyId: unknown = (envelope as { payload?: { companyId?: unknown } } | null)?.payload?.companyId;
    return typeof companyId === 'string' ? companyId : UNKNOWN_COMPANY;
}

@Injectable()
export class PortfolioWatchDailyHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.portfolioWatch;
    public readonly type: string = MESSAGE_TYPES.portfolioWatchDailyCompanyRequested;

    public constructor(
        private readonly application: PortfolioWatchDailyApplication,
        public readonly redis: RedisConnection
    ) {
        super();
    }

    @JobMutex({ lockKey: 'portfolio-watch-daily', identify: companyOf })
    public async handle(envelope: QueueEnvelope, _job?: RunningJob): Promise<void> {
        const parsed: ReturnType<typeof dailyPayloadSchema.safeParse> = dailyPayloadSchema.safeParse(envelope.payload);
        if (parsed.success) {
            await this.application.evaluate(parsed.data.companyId);
        }
    }
}
