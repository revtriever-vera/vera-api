import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { JobMutex } from '../../../../core/queue/job-mutex.decorator';
import { QueueEnvelope, QueueHandlerPort, RunningJob } from '../../../../core/queue/queue.types';
import { RedisConnection } from '../../../../core/queue/redis.connection';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { MarketDocumentsSweepApplication } from '../../application/market-documents-sweep.application';

const LOCK_IDENTITY: string = 'global';

@Injectable()
export class MarketDocumentsSweepCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.marketDocumentsSweep;
    public readonly queue: QueueName = QUEUES.marketDocuments;
    public readonly type: string = MESSAGE_TYPES.marketDocumentsSweepRequested;
    public readonly pattern: string = CRON.everySixHours;
}

@Injectable()
export class MarketDocumentsSweepTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.marketDocuments;
    public readonly type: string = MESSAGE_TYPES.marketDocumentsSweepRequested;

    public constructor(
        private readonly application: MarketDocumentsSweepApplication,
        public readonly redis: RedisConnection
    ) {
        super();
    }

    @JobMutex({ lockKey: 'market-documents-sweep', identify: (): string => LOCK_IDENTITY })
    public async handle(_envelope: QueueEnvelope, _job?: RunningJob): Promise<void> {
        await this.application.handleTick();
    }
}
