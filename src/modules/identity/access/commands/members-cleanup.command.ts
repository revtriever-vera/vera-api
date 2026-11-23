import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { MembersCleanupApplication } from '../../application/members-cleanup.application';

@Injectable()
export class MembersCleanupCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.identityMembersCleanup;
    public readonly queue: QueueName = QUEUES.identity;
    public readonly type: string = MESSAGE_TYPES.identityMembersCleanupRequested;
    public readonly pattern: string = CRON.everyDayAtFourAm;
}

@Injectable()
export class MembersCleanupTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.identity;
    public readonly type: string = MESSAGE_TYPES.identityMembersCleanupRequested;

    public constructor(private readonly application: MembersCleanupApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.anonymizeRemoved();
    }
}
