import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { CatalogSyncApplication } from '../../application/catalog-sync.application';
import { SYNC_CADENCES } from '../../domain/catalog.types';

@Injectable()
export class CatalogSyncWeeklyCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.catalogSyncWeekly;
    public readonly queue: QueueName = QUEUES.catalog;
    public readonly type: string = MESSAGE_TYPES.catalogSyncTickRequested;
    public readonly pattern: string = CRON.everyMondayAtSixAm;

    public override get payload(): Readonly<Record<string, unknown>> {
        return { cadence: SYNC_CADENCES.weekly };
    }
}

@Injectable()
export class CatalogSyncTesouroDailyCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.catalogSyncTesouroDaily;
    public readonly queue: QueueName = QUEUES.catalog;
    public readonly type: string = MESSAGE_TYPES.catalogSyncTickRequested;
    public readonly pattern: string = CRON.everyDayAtSixAm;

    public override get payload(): Readonly<Record<string, unknown>> {
        return { cadence: SYNC_CADENCES.tesouroDaily };
    }
}

@Injectable()
export class CatalogSyncTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.catalog;
    public readonly type: string = MESSAGE_TYPES.catalogSyncTickRequested;

    public constructor(private readonly application: CatalogSyncApplication) {
        super();
    }

    public async handle(envelope: QueueEnvelope): Promise<void> {
        await this.application.handleTick(envelope.payload);
    }
}
