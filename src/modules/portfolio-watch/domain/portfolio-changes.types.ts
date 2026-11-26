import type { HolderFilter } from '../../../shared/holder/holder-filter';
import type { SummaryKind } from '../../market-documents/services/market-documents-reader.service';

export const CHANGES_WINDOWS = [7, 30] as const;
export type ChangesWindow = (typeof CHANGES_WINDOWS)[number];
export const DEFAULT_CHANGES_WINDOW: ChangesWindow = 7;
export const MAX_CHANGES_ITEMS: number = 100;
export const FEATURE_LOCKED_CODE: string = 'plan.feature_locked';
export const CHANGES_FEATURE: string = 'portfolio_changes';

export interface ChangesQuery {
    readonly days: ChangesWindow;
    readonly classId: string | null;
    readonly holder: HolderFilter;
}

export interface HeldAsset {
    readonly assetId: string;
    readonly symbol: string;
    readonly weightBps: number | null;
}

export interface ChangeItem {
    readonly id: string;
    readonly assetId: string;
    readonly symbol: string;
    readonly source: string;
    readonly category: string;
    readonly kind: SummaryKind | null;
    readonly date: string;
    readonly summary: string;
    readonly summaryAvailable: boolean;
    readonly relevance: number | null;
    readonly weightBps: number | null;
    readonly weightLine: string | null;
    readonly documentUrl: string;
}

export interface ChangesFeed {
    readonly days: ChangesWindow;
    readonly notice: string;
    readonly items: ChangeItem[];
}
