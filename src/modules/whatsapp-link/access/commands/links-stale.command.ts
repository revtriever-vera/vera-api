import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { UnlinkApplication } from '../../application/unlink.application';

@Injectable()
export class WhatsAppLinksStaleCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.whatsappLinksStale;
    public readonly queue: QueueName = QUEUES.whatsapp;
    public readonly type: string = MESSAGE_TYPES.whatsappLinksStaleRequested;
    public readonly pattern: string = CRON.everyDayAtFourAm;
}

@Injectable()
export class WhatsAppLinksStaleTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.whatsapp;
    public readonly type: string = MESSAGE_TYPES.whatsappLinksStaleRequested;

    public constructor(private readonly application: UnlinkApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.unlinkStale();
    }
}
