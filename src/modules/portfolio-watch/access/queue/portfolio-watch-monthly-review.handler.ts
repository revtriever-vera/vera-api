import { Injectable } from '@nestjs/common';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { PortfolioMonthlyReviewApplication } from '../../application/portfolio-monthly-review.application';
import { monthlyReviewPayloadSchema } from '../../validation/monthly-review.schemas';

@Injectable()
export class PortfolioWatchMonthlyReviewHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.portfolioWatch;
    public readonly type: string = MESSAGE_TYPES.portfolioWatchMonthlyReviewCompanyRequested;

    public constructor(private readonly application: PortfolioMonthlyReviewApplication) {
        super();
    }

    public async handle(envelope: QueueEnvelope): Promise<void> {
        const parsed: ReturnType<typeof monthlyReviewPayloadSchema.safeParse> = monthlyReviewPayloadSchema.safeParse(envelope.payload);
        if (parsed.success) {
            await this.application.reviewCompany(parsed.data.companyId, parsed.data.month);
        }
    }
}
