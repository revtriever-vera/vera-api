import { ChangeItem } from './portfolio-changes.types';
import { WeeklyChangeProp } from '../validation/portfolio-watch.schemas';

export const WEEKLY_CHANGES_NOTICE_TYPE: string = 'portfolio_weekly_changes';
export const WEEKLY_CHANGES_TEMPLATE: string = 'portfolio-weekly-changes';
export const WEEKLY_CHANGES_DAYS: 7 | 30 = 7;
export const WEEKLY_MIN_RELEVANCE: number = 2;
export const WEEKLY_MAX_ITEMS: number = 5;
export const WEEKLY_ITEMS_PROP: string = 'items';
export const WEEKLY_PORTFOLIO_URL_PROP: string = 'portfolioUrl';
const PORTFOLIO_PATH: string = '/portfolio';
const THURSDAY_OFFSET: number = 3;
const DAYS_PER_WEEK: number = 7;
const MS_PER_DAY: number = 86_400_000;

export function isoWeekOf(day: string): string {
    const date: Date = new Date(`${day}T00:00:00Z`);
    const weekday: number = (date.getUTCDay() + 6) % DAYS_PER_WEEK;
    const thursday: Date = new Date(date.getTime() + (THURSDAY_OFFSET - weekday) * MS_PER_DAY);
    const yearStart: number = Date.UTC(thursday.getUTCFullYear(), 0, 1);
    const week: number = Math.floor((thursday.getTime() - yearStart) / MS_PER_DAY / DAYS_PER_WEEK) + 1;
    return `${String(thursday.getUTCFullYear())}-W${String(week).padStart(2, '0')}`;
}

export function weeklyNoticeKeyOf(week: string): string {
    return `${WEEKLY_CHANGES_NOTICE_TYPE}:${week}`;
}

export function weeklyItemsOf(items: readonly ChangeItem[]): ChangeItem[] {
    return items.filter((item: ChangeItem): boolean => (item.relevance ?? 0) >= WEEKLY_MIN_RELEVANCE).slice(0, WEEKLY_MAX_ITEMS);
}

function propOf(item: ChangeItem): WeeklyChangeProp {
    return { symbol: item.symbol, title: item.title, summary: item.summary, documentUrl: item.documentUrl };
}

export function weeklyChangesProps(items: readonly ChangeItem[], appUrl: string): Record<string, string> {
    return {
        [WEEKLY_ITEMS_PROP]: JSON.stringify(items.map(propOf)),
        [WEEKLY_PORTFOLIO_URL_PROP]: `${appUrl}${PORTFOLIO_PATH}`
    };
}
