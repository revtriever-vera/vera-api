export type OperationKind = 'buy' | 'sell' | 'split' | 'reverse_split' | 'bonus' | 'income' | 'transfer';
export type IncomeKind = 'dividend' | 'jcp' | 'fii_income' | 'interest' | 'staking';

export const FORMAT_SUGGESTIONS = { b3Excel: 'b3_excel_download' } as const;
export type FormatSuggestion = (typeof FORMAT_SUGGESTIONS)[keyof typeof FORMAT_SUGGESTIONS];

export const PARSED_SOURCES = { b3: 'b3', cryptoCsv: 'crypto_csv', model: 'model' } as const;
export type ParsedSource = (typeof PARSED_SOURCES)[keyof typeof PARSED_SOURCES];

export const POSITION_GROUPS = { stock: 'stock', bdr: 'bdr', etf: 'etf', fund: 'fund', treasury: 'treasury' } as const;
export type PositionGroup = (typeof POSITION_GROUPS)[keyof typeof POSITION_GROUPS];

export type OperationDirection = 'credit' | 'debit';

export interface ParsedOperation {
    readonly sheet: string;
    readonly line: number;
    readonly kind: OperationKind;
    readonly incomeKind: IncomeKind | null;
    readonly direction: OperationDirection;
    readonly tradeDate: string;
    readonly ticker: string;
    readonly productName: string | null;
    readonly institution: string | null;
    readonly market: string | null;
    readonly quantity: string;
    readonly unitPrice: string | null;
    readonly grossMinor: number | null;
    readonly currency: string;
    readonly appliedToPosition: boolean;
    readonly matchKey: string;
    readonly alreadyImported: boolean;
}

export interface ParsedPositionAdjustment {
    readonly sheet: string;
    readonly line: number;
    readonly group: PositionGroup;
    readonly ticker: string | null;
    readonly productName: string;
    readonly institution: string | null;
    readonly cnpj: string | null;
    readonly isin: string | null;
    readonly maturityDate: string | null;
    readonly indexer: string | null;
    readonly quantity: string;
    readonly availableQuantity: string | null;
    readonly unavailableQuantity: string | null;
    readonly restrictionReason: string | null;
    readonly referencePrice: string | null;
}

export interface ParsedFixedIncomePrices {
    readonly issue: string | null;
    readonly mtm: string | null;
    readonly curve: string | null;
    readonly closing: string | null;
}

export interface ParsedFixedIncomeValues {
    readonly mtmMinor: number | null;
    readonly curveMinor: number | null;
    readonly closingMinor: number | null;
}

export interface ParsedFixedIncome {
    readonly sheet: string;
    readonly line: number;
    readonly code: string | null;
    readonly product: string;
    readonly issuer: string | null;
    readonly institution: string | null;
    readonly indexer: string | null;
    readonly regime: string | null;
    readonly issueDate: string | null;
    readonly maturityDate: string | null;
    readonly quantity: string;
    readonly availableQuantity: string | null;
    readonly unavailableQuantity: string | null;
    readonly restrictionReason: string | null;
    readonly unitPrices: ParsedFixedIncomePrices;
    readonly values: ParsedFixedIncomeValues;
}

export const IGNORE_REASONS = {
    settlement: 'settlement',
    unsupportedMovement: 'unsupported_movement',
    unsupportedMarket: 'unsupported_market'
} as const;
export type IgnoreReason = (typeof IGNORE_REASONS)[keyof typeof IGNORE_REASONS];

export const REJECT_REASONS = {
    invalidDate: 'invalid_date',
    invalidQuantity: 'invalid_quantity',
    invalidPrice: 'invalid_price',
    invalidAmount: 'invalid_amount',
    invalidSide: 'invalid_side',
    missingAsset: 'missing_asset'
} as const;
export type RejectReason = (typeof REJECT_REASONS)[keyof typeof REJECT_REASONS];

export interface IgnoredLine {
    readonly sheet: string;
    readonly line: number;
    readonly reason: IgnoreReason;
    readonly description: string;
    readonly tradeDate: string | null;
    readonly productCode: string | null;
}

export interface RejectedLine {
    readonly sheet: string;
    readonly line: number;
    readonly reason: RejectReason;
}

export const B3_REPORT_KINDS = {
    negotiation: 'negotiation',
    movement: 'movement',
    position: 'position'
} as const;
export type B3ReportKind = (typeof B3_REPORT_KINDS)[keyof typeof B3_REPORT_KINDS];

export interface ParsedInvestmentStatement {
    readonly source: ParsedSource;
    readonly reportKinds: readonly B3ReportKind[];
    readonly currency: string;
    readonly operations: readonly ParsedOperation[];
    readonly positionAdjustments: readonly ParsedPositionAdjustment[];
    readonly fixedIncome: readonly ParsedFixedIncome[];
    readonly ignored: readonly IgnoredLine[];
    readonly rejected: readonly RejectedLine[];
}
