import { AppLocale } from '../../../../shared/i18n/locale';
import { GeneratedSummaryKind } from '../summary.types';
import { summaryCutsPrompt } from './summary-cuts.prompt';
import { summaryMonthPrompt } from './summary-month.prompt';
import { summaryMonthlyReviewPrompt } from './summary-monthly-review.prompt';
import { summaryPortfolioPrompt } from './summary-portfolio.prompt';

const PROMPTS: Readonly<Record<GeneratedSummaryKind, (locale: AppLocale) => string>> = {
    month: summaryMonthPrompt,
    cuts: summaryCutsPrompt,
    portfolio: summaryPortfolioPrompt,
    monthly_review: summaryMonthlyReviewPrompt
};

export function summarySystemPromptOf(kind: GeneratedSummaryKind, locale: AppLocale): string {
    return PROMPTS[kind](locale);
}
