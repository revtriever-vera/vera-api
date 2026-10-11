import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { ReferenceDataApplication } from '../../application/reference-data.application';

@Injectable()
export class PtaxAfternoonCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.marketDataPtaxAfternoon;
    public readonly queue: QueueName = QUEUES.marketData;
    public readonly type: string = MESSAGE_TYPES.marketDataPtaxRequested;
    public readonly pattern: string = CRON.weekdaysAtTwoThirtyPm;
}

@Injectable()
export class PtaxAfternoonTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.marketData;
    public readonly type: string = MESSAGE_TYPES.marketDataPtaxRequested;

    public constructor(private readonly application: ReferenceDataApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.handlePtax();
    }
}
