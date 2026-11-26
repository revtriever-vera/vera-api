import { MONTHLY_REVIEW_PROP } from './monthly-review-notice.types';
import { MonthlyReview } from '../validation/monthly-review.schemas';

export const MONTHLY_REVIEW_NOTICE_TYPE: string = 'portfolio_monthly_review';
export const MONTHLY_REVIEW_TEMPLATE: string = 'portfolio-monthly-review';
const REVIEW_PATH: string = '/portfolio/review';

type BenchmarkRow = MonthlyReview['benchmarks']['cdi'];

export function monthlyReviewNoticeKeyOf(month: string): string {
    return `${MONTHLY_REVIEW_NOTICE_TYPE}:${month}`;
}

function benchmarkEntry(name: string, benchmark: BenchmarkRow): Record<string, string> {
    return benchmark.state === 'ok' && benchmark.returnPct !== null ? { [name]: String(benchmark.returnPct) } : {};
}

export function monthlyReviewProps(review: MonthlyReview, paragraphs: readonly string[] | null, appUrl: string): Record<string, string> {
    return {
        [MONTHLY_REVIEW_PROP.month]: review.month,
        [MONTHLY_REVIEW_PROP.currency]: review.baseCurrency,
        [MONTHLY_REVIEW_PROP.incomeMinor]: String(review.income.amountMinor),
        [MONTHLY_REVIEW_PROP.reviewUrl]: `${appUrl}${REVIEW_PATH}`,
        ...(review.returnPct === undefined ? {} : { [MONTHLY_REVIEW_PROP.returnPct]: String(review.returnPct) }),
        ...benchmarkEntry(MONTHLY_REVIEW_PROP.cdiPct, review.benchmarks.cdi),
        ...benchmarkEntry(MONTHLY_REVIEW_PROP.ipcaPct, review.benchmarks.ipca),
        ...benchmarkEntry(MONTHLY_REVIEW_PROP.ibovespaPct, review.benchmarks.ibovespa),
        ...(paragraphs === null ? {} : { [MONTHLY_REVIEW_PROP.paragraphs]: JSON.stringify(paragraphs) })
    };
}
