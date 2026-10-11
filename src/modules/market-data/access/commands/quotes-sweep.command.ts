import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { QuotesSweepApplication } from '../../application/quotes-sweep.application';

@Injectable()
export class QuotesSweepCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.marketDataQuotesSweep;
    public readonly queue: QueueName = QUEUES.marketData;
    public readonly type: string = MESSAGE_TYPES.marketDataQuotesSweepRequested;
    public readonly pattern: string = CRON.everyDayAtTenThirtyPm;
}

@Injectable()
export class QuotesSweepTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.marketData;
    public readonly type: string = MESSAGE_TYPES.marketDataQuotesSweepRequested;

    public constructor(private readonly application: QuotesSweepApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.handleTick();
    }
}
