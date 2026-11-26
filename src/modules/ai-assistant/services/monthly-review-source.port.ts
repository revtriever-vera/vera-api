import { ReviewClassLabel, ReviewSource } from '../domain/context/ai-context.types';

export interface MonthlyReviewSourceView {
    readonly review: ReviewSource;
    readonly labels: readonly ReviewClassLabel[];
}

export abstract class MonthlyReviewSourcePort {
    public abstract of(month: string): Promise<MonthlyReviewSourceView | null>;
}
