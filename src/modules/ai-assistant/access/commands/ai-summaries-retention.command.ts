import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { SummariesApplication } from '../../application/summaries.application';

@Injectable()
export class AiSummariesRetentionCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.aiSummariesRetention;
    public readonly queue: QueueName = QUEUES.aiAssistant;
    public readonly type: string = MESSAGE_TYPES.aiSummariesRetentionRequested;
    public readonly pattern: string = CRON.firstOfMonthAtFourAm;
}

@Injectable()
export class AiSummariesRetentionTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.aiAssistant;
    public readonly type: string = MESSAGE_TYPES.aiSummariesRetentionRequested;

    public constructor(private readonly application: SummariesApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.purgeExpired();
    }
}
