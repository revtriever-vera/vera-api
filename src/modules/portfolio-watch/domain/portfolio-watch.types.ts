import { Selectable } from 'kysely';
import { PortfolioIncomeLedger, PortfolioMonthlySnapshots } from '../../../core/database/generated/database.types';

export type MonthlySnapshotRow = Selectable<PortfolioMonthlySnapshots>;
export type IncomeLedgerRow = Selectable<PortfolioIncomeLedger>;

export const SNAPSHOT_RETENTION_MONTHS: number = 36;
export const EXPORT_PAGE: number = 500;
export const PRUNE_BATCH: number = 500;

export interface MonthlySnapshotEntry {
    readonly assetId: string;
    readonly holdingKind: string;
    readonly classId: string | null;
    readonly quantity: string | null;
    readonly price: string | null;
    readonly priceDate: string | null;
    readonly valueMinor: number;
    readonly currency: string;
}

export interface IncomeLedgerEntry {
    readonly eventId: string;
    readonly assetId: string;
    readonly quantityAtExDate: string;
    readonly amountMinor: number;
    readonly currency: string;
    readonly paymentDate: string | null;
}

export interface IncomeEventInput {
    readonly eventId: string;
    readonly assetId: string;
    readonly amountPerUnit: string;
    readonly currency: string;
    readonly paymentDate: string | null;
}
