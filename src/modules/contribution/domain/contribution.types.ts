export const CONTRIBUTION_WARNINGS = {
    classTargetsNot100: 'class_targets_not_100'
} as const;

export type ContributionWarning = (typeof CONTRIBUTION_WARNINGS)[keyof typeof CONTRIBUTION_WARNINGS];

export const NO_ASSETS_NOTE = 'no_assets' as const;

export type BaseCurrency = 'BRL' | 'USD';

export type TypeGroup = 'fixed_income' | 'tesouro' | 'acoes_br' | 'fii' | 'acoes_eua' | 'reits' | 'cripto';

export const MAX_CONTRIBUTION_MINOR: number = 100_000_000_000;

export interface AssetSuggestion {
    readonly kind: 'position' | 'fixed_income';
    readonly id: string;
    readonly assetId: string | null;
    readonly typeGroup: TypeGroup;
    readonly symbol: string;
    readonly name: string;
    readonly amountMinor: number;
    readonly approxUnits: string | null;
    readonly unitPrice: string | null;
    readonly priceCurrency: string | null;
    readonly shareInClassBeforeBps: number;
    readonly shareInClassAfterBps: number;
    readonly targetInClassBps: number;
}

export interface ClassSuggestion {
    readonly classId: string;
    readonly systemKey: string | null;
    readonly name: string | null;
    readonly colorKey: string;
    readonly amountMinor: number;
    readonly valueBeforeMinor: number;
    readonly shareBeforeBps: number;
    readonly shareAfterBps: number;
    readonly targetBps: number;
    readonly note: typeof NO_ASSETS_NOTE | null;
    readonly assets: AssetSuggestion[];
}

export interface ContributionSuggestion {
    readonly baseCurrency: BaseCurrency;
    readonly amountMinor: number;
    readonly totalBeforeMinor: number;
    readonly totalAfterMinor: number;
    readonly warnings: ContributionWarning[];
    readonly classes: ClassSuggestion[];
}
