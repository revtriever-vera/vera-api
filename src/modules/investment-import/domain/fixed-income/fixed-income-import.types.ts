import type { Indexer } from '../../../fixed-income/services/index-series-math';
import type { TitleKind } from '../../../fixed-income/services/fixed-income-title-importer.service';
import { INFERENCE_REASONS } from './rate-inference';

export const FIXED_INCOME_STATUSES = {
    inferred: 'inferred',
    check: 'check',
    needsInput: 'needs_input',
    duplicate: 'duplicate'
} as const;
export type FixedIncomeStatus = (typeof FIXED_INCOME_STATUSES)[keyof typeof FIXED_INCOME_STATUSES];

export const FIXED_INCOME_REASONS = {
    ...INFERENCE_REASONS,
    paymentEvent: 'payment_event',
    gracePeriod: 'grace_period',
    applicationDateDiffers: 'application_date_differs',
    estimatedSeries: 'estimated_series',
    assumedFacePrice: 'assumed_face_price',
    unsupportedKind: 'unsupported_kind',
    incompleteData: 'incomplete_data',
    duplicate: 'duplicate'
} as const;
export type FixedIncomeReason = (typeof FIXED_INCOME_REASONS)[keyof typeof FIXED_INCOME_REASONS];

export const FIXED_INCOME_FACE_UNIT_PRICE: string = '1000';
export const FIXED_INCOME_NAME_MAX_LENGTH: number = 80;

export interface StoredFixedIncome {
    readonly lineId: string;
    readonly product: string;
    readonly issuerName: string | null;
    readonly issuerId: string | null;
    readonly kind: TitleKind | null;
    readonly indexer: Indexer | null;
    readonly rateBps: number | null;
    readonly appliedMinor: number | null;
    readonly appliedAt: string | null;
    readonly maturityDate: string | null;
    readonly status: FixedIncomeStatus;
    readonly reason: FixedIncomeReason | null;
    readonly suggestion: string;
}

export interface FixedIncomeTitleEdits {
    readonly name?: string;
    readonly kind?: TitleKind;
    readonly issuerId?: string | null;
    readonly indexer?: Indexer;
    readonly rateBps?: number;
    readonly appliedMinor?: number;
    readonly appliedAt?: string;
    readonly maturityDate?: string;
}

export interface FixedIncomeDecision {
    readonly lineId: string;
    readonly confirm?: true;
    readonly edits?: FixedIncomeTitleEdits;
    readonly skip?: true;
}

export interface FixedIncomeOutcome {
    readonly lineId: string;
    readonly titleId: string;
}
