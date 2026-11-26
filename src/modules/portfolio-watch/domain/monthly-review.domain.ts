import { Injectable } from '@nestjs/common';
import { MonthlyReviewRow } from './monthly-review.types';
import { MonthlyReviewsRepository } from '../repositories/monthly-reviews.repository';

@Injectable()
export class MonthlyReviewDomain {
    public constructor(private readonly reviews: MonthlyReviewsRepository) {}

    public async record(month: string, payload: unknown): Promise<boolean> {
        return this.reviews.recordIfAbsent(month, payload);
    }

    public async find(month: string): Promise<MonthlyReviewRow | null> {
        return this.reviews.findByMonth(month);
    }

    public async listRecent(): Promise<MonthlyReviewRow[]> {
        return this.reviews.listRecent();
    }

    public async eraseAll(): Promise<number> {
        return this.reviews.eraseAll();
    }
}
