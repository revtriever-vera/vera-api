import { addDays } from './date-math';

export const SYNC_OVERLAP_DAYS: number = 7;

export interface SyncWindow {
    readonly from: string;
    readonly to: string;
}

export function syncWindowOf(syncedThrough: string | null, today: string, initialHistoryDays: number): SyncWindow {
    const from: string = syncedThrough === null ? addDays(today, -initialHistoryDays) : addDays(syncedThrough, -SYNC_OVERLAP_DAYS);
    return { from: from > today ? today : from, to: today };
}
