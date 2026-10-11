import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { ReferenceDataApplication } from '../../application/reference-data.application';

@Injectable()
export class ReferenceDailyCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.marketDataReferenceDaily;
    public readonly queue: QueueName = QUEUES.marketData;
    public readonly type: string = MESSAGE_TYPES.marketDataReferenceRequested;
    public readonly pattern: string = CRON.everyDayAtNineAm;
}

@Injectable()
export class ReferenceDailyTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.marketData;
    public readonly type: string = MESSAGE_TYPES.marketDataReferenceRequested;

    public constructor(private readonly application: ReferenceDataApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.handleReference();
    }
}
