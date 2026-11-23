import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { UsageApplication } from '../../application/usage.application';

@Injectable()
export class UsageCleanupCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.usageCleanup;
    public readonly queue: QueueName = QUEUES.usage;
    public readonly type: string = MESSAGE_TYPES.usageCleanupRequested;
    public readonly pattern: string = CRON.firstOfMonthAtFourAm;
}

@Injectable()
export class UsageCleanupTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.usage;
    public readonly type: string = MESSAGE_TYPES.usageCleanupRequested;

    public constructor(private readonly application: UsageApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.purgeExpired();
    }
}

@Injectable()
export class UsageGaugeCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.usageGauge;
    public readonly queue: QueueName = QUEUES.usage;
    public readonly type: string = MESSAGE_TYPES.usageGaugeRequested;
    public readonly pattern: string = CRON.everyDayAtSixAm;
}

@Injectable()
export class UsageGaugeTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.usage;
    public readonly type: string = MESSAGE_TYPES.usageGaugeRequested;

    public constructor(private readonly application: UsageApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.publishGauge();
    }
}
