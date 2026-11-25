import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { InvestmentImportPreviewApplication } from '../../application/investment-import-preview.application';

@Injectable()
export class PreviewsPurgeCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.investmentImportPreviewsPurge;
    public readonly queue: QueueName = QUEUES.investmentImport;
    public readonly type: string = MESSAGE_TYPES.investmentImportPreviewsPurgeRequested;
    public readonly pattern: string = CRON.everyThirtyMinutes;
}

@Injectable()
export class PreviewsPurgeTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.investmentImport;
    public readonly type: string = MESSAGE_TYPES.investmentImportPreviewsPurgeRequested;

    public constructor(private readonly application: InvestmentImportPreviewApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.purgeExpired();
    }
}
