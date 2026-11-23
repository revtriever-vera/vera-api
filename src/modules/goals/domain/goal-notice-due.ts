const NOTICE_LEAD_DAYS: number = 30;
const MS_PER_DAY: number = 86_400_000;

export function isoDatePlusDays(isoDate: string, days: number): string {
    return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function isFirstOfMonth(isoDate: string): boolean {
    return isoDate.endsWith('-01');
}

export function noticeLeadDate(today: string): string {
    return isoDatePlusDays(today, NOTICE_LEAD_DAYS);
}

export function isNoticeDue(today: string, targetDate: string): boolean {
    return isFirstOfMonth(today) || targetDate === noticeLeadDate(today);
}
