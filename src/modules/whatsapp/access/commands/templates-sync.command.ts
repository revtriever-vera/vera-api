import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { ChannelMaintenanceApplication } from '../../application/channel-maintenance.application';

@Injectable()
export class TemplatesSyncCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.whatsappTemplatesSync;
    public readonly queue: QueueName = QUEUES.whatsapp;
    public readonly type: string = MESSAGE_TYPES.whatsappTemplatesSyncRequested;
    public readonly pattern: string = CRON.everyHour;
}

@Injectable()
export class TemplatesSyncTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.whatsapp;
    public readonly type: string = MESSAGE_TYPES.whatsappTemplatesSyncRequested;

    public constructor(private readonly application: ChannelMaintenanceApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.syncTemplates();
    }
}
