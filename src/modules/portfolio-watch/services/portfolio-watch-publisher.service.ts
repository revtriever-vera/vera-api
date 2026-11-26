import { Injectable } from '@nestjs/common';
import { QueuePublisherPort } from '../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES } from '../../../shared/constants/queues.constants';
import { MonthlyReviewPayload } from '../validation/monthly-review.schemas';
import { DailyPayload, SnapshotPayload, WeeklyPayload } from '../validation/portfolio-watch.schemas';

export function monthlySnapshotJobId(companyId: string, month: string): string {
    return `portfolio-watch-snapshot-${companyId}-${month}`;
}

export function monthlyReviewJobId(companyId: string, month: string): string {
    return `portfolio-watch-review-${companyId}-${month}`;
}

export function dailyJobId(companyId: string, day: string): string {
    return `portfolio-watch-daily-${companyId}-${day}`;
}

export function weeklyJobId(companyId: string, week: string): string {
    return `portfolio-watch-weekly-${companyId}-${week}`;
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

    public async requestMonthlyReview(companyId: string, month: string): Promise<void> {
        const payload: MonthlyReviewPayload = { companyId, month };
        await this.publisher.publish(QUEUES.portfolioWatch, MESSAGE_TYPES.portfolioWatchMonthlyReviewCompanyRequested, payload, {
            jobId: monthlyReviewJobId(companyId, month)
        });
    }

    public async requestDaily(companyId: string, day: string): Promise<void> {
        const payload: DailyPayload = { companyId };
        await this.publisher.publish(QUEUES.portfolioWatch, MESSAGE_TYPES.portfolioWatchDailyCompanyRequested, payload, {
            jobId: dailyJobId(companyId, day)
        });
    }

    public async requestWeekly(companyId: string, week: string): Promise<void> {
        const payload: WeeklyPayload = { companyId };
        await this.publisher.publish(QUEUES.portfolioWatch, MESSAGE_TYPES.portfolioWatchWeeklyChangesCompanyRequested, payload, {
            jobId: weeklyJobId(companyId, week)
        });
    }
}
