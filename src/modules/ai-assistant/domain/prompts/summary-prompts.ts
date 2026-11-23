import { AppLocale } from '../../../../shared/i18n/locale';
import { SummaryKind } from '../summary.types';
import { summaryCutsPrompt } from './summary-cuts.prompt';
import { summaryMonthPrompt } from './summary-month.prompt';
import { summaryPortfolioPrompt } from './summary-portfolio.prompt';

const PROMPTS: Readonly<Record<SummaryKind, (locale: AppLocale) => string>> = {
    month: summaryMonthPrompt,
    cuts: summaryCutsPrompt,
    portfolio: summaryPortfolioPrompt
};

export function summarySystemPromptOf(kind: SummaryKind, locale: AppLocale): string {
    return PROMPTS[kind](locale);
}
