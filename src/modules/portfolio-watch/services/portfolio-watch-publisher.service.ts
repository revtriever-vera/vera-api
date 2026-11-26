import { Injectable } from '@nestjs/common';
import { QueuePublisherPort } from '../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES } from '../../../shared/constants/queues.constants';
import { DailyPayload, SnapshotPayload } from '../validation/portfolio-watch.schemas';

export function monthlySnapshotJobId(companyId: string, month: string): string {
    return `portfolio-watch-snapshot-${companyId}-${month}`;
}

export function dailyJobId(companyId: string, day: string): string {
    return `portfolio-watch-daily-${companyId}-${day}`;
}

@Injectable()
export class PortfolioWatchPublisherService {
    public constructor(private readonly publisher: QueuePublisherPort) {}

    public async requestMonthlySnapshot(companyId: string, month: string): Promise<void> {
        const payload: SnapshotPayload = { companyId };
        await this.publisher.publish(QUEUES.portfolioWatch, MESSAGE_TYPES.portfolioWatchMonthlySnapshotCompanyRequested, payload, {
            jobId: monthlySnapshotJobId(companyId, month),
            replaceExisting: true
        });
    }

    public async requestDaily(companyId: string, day: string): Promise<void> {
        const payload: DailyPayload = { companyId };
        await this.publisher.publish(QUEUES.portfolioWatch, MESSAGE_TYPES.portfolioWatchDailyCompanyRequested, payload, {
            jobId: dailyJobId(companyId, day)
        });
    }
}
