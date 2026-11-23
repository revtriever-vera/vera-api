import { Selectable } from 'kysely';
import { RecurringNoticePrefs } from '../../../core/database/generated/database.types';

export type RecurringNoticePref = Selectable<RecurringNoticePrefs>;

export const NOTICE_TYPES = {
    week: 'recurring_week',
    due: 'recurring_due'
} as const;

export const NOTICE_TEMPLATES = {
    week: 'recurring-week',
    due: 'recurring-due'
} as const;

export const SEND_HOUR: number = 9;
export const WEEK_SPAN_DAYS: number = 6;
export const DUE_HORIZON_DAYS: number = 2;
export const ALERT_LOOKBACK_DAYS: number = 6;
export const PREFS_LIMIT: number = 5000;
export const EXPORT_PAGE: number = 500;
export const MONDAY: number = 1;
export const DAYS_IN_WEEK: number = 7;
