import { addDays } from './curve/business-days';
import { INDEX_SERIES_START } from './index-series';

export interface SyncWindow {
    readonly from: string;
    readonly to: string;
}

export function planSyncWindows(lastDate: string | null, today: string): SyncWindow[] {
    const start: string = lastDate === null || lastDate < INDEX_SERIES_START ? INDEX_SERIES_START : lastDate;
    const windows: SyncWindow[] = [];
    let from: string = start > today ? today : start;
    while (from <= today) {
        const yearEnd: string = `${from.slice(0, 4)}-12-31`;
        const to: string = yearEnd < today ? yearEnd : today;
        windows.push({ from, to });
        from = addDays(to, 1);
    }
    return windows;
}
