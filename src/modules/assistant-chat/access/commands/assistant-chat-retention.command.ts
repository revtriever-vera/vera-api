import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { AssistantConversationApplication } from '../../application/assistant-conversation.application';

@Injectable()
export class AssistantChatRetentionCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.assistantChatRetention;
    public readonly queue: QueueName = QUEUES.assistantChat;
    public readonly type: string = MESSAGE_TYPES.assistantRetentionRequested;
    public readonly pattern: string = CRON.everyDayAtFourAm;
}

@Injectable()
export class AssistantChatRetentionTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.assistantChat;
    public readonly type: string = MESSAGE_TYPES.assistantRetentionRequested;

    public constructor(private readonly application: AssistantConversationApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.purgeExpired();
    }
}
