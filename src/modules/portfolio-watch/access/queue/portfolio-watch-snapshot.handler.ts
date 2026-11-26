import { Injectable } from '@nestjs/common';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { PortfolioWatchSnapshotApplication } from '../../application/portfolio-watch-snapshot.application';
import { snapshotPayloadSchema } from '../../validation/portfolio-watch.schemas';

@Injectable()
export class PortfolioWatchSnapshotHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.portfolioWatch;
    public readonly type: string = MESSAGE_TYPES.portfolioWatchMonthlySnapshotCompanyRequested;

    public constructor(private readonly application: PortfolioWatchSnapshotApplication) {
        super();
    }

    public async handle(envelope: QueueEnvelope): Promise<void> {
        const parsed: ReturnType<typeof snapshotPayloadSchema.safeParse> = snapshotPayloadSchema.safeParse(envelope.payload);
        if (parsed.success) {
            await this.application.snapshotCompany(parsed.data.companyId);
        }
    }
}
