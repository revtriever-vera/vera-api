import { Insertable, Selectable } from 'kysely';
import { AssetClassAssignments, AssetClasses, PortfolioSettings } from '../../../core/database/generated/database.types';

export type AssetClass = Selectable<AssetClasses>;
export type ClassAssignment = Selectable<AssetClassAssignments>;

export type PortfolioSettingsRow = Selectable<PortfolioSettings>;
export type NewPortfolioSettings = Insertable<PortfolioSettings>;

export type NewAssetClass = Insertable<AssetClasses>;
export type NewClassAssignment = Insertable<AssetClassAssignments>;

export const SUBJECT_TYPES = {
    position: 'position',
    fixedIncome: 'fixed_income'
} as const;

export type SubjectType = (typeof SUBJECT_TYPES)[keyof typeof SUBJECT_TYPES];

export const SYSTEM_CLASS_KEYS = {
    rfPos: 'rf_pos',
    rfPre: 'rf_pre',
    rfIpca: 'rf_ipca',
    acoesBr: 'acoes_br',
    fii: 'fii',
    acoesEua: 'acoes_eua',
    reits: 'reits',
    cripto: 'cripto'
} as const;

export type SystemClassKey = (typeof SYSTEM_CLASS_KEYS)[keyof typeof SYSTEM_CLASS_KEYS];

export const CLASS_COLOR_KEYS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12'] as const;

export type ClassColorKey = (typeof CLASS_COLOR_KEYS)[number];

export const CLASS_ACTIONS = {
    created: 'created',
    renamed: 'renamed',
    merged: 'merged',
    deleted: 'deleted',
    seeded: 'seeded'
} as const;

export type ClassAction = (typeof CLASS_ACTIONS)[keyof typeof CLASS_ACTIONS];

export const MAX_CLASSES_PER_COMPANY: number = 30;
export const CLASS_NAME_MIN_LENGTH: number = 1;
export const CLASS_NAME_MAX_LENGTH: number = 40;
export const MAX_BPS: number = 10000;
export const TOTAL_BPS: number = 10000;

export const BASE_CURRENCIES = {
    brl: 'BRL',
    usd: 'USD'
} as const;

export type BaseCurrency = (typeof BASE_CURRENCIES)[keyof typeof BASE_CURRENCIES];

export const DEFAULT_BASE_CURRENCY: BaseCurrency = BASE_CURRENCIES.brl;
export const DEFAULT_TOLERANCE_BPS: number = 500;
export const MAX_TOLERANCE_BPS: number = 2000;

export const TARGET_SCOPES = {
    classes: 'classes',
    assets: 'assets',
    reset: 'reset'
} as const;

export type TargetScope = (typeof TARGET_SCOPES)[keyof typeof TARGET_SCOPES];

export const TARGET_RESULTS = {
    saved: 'saved',
    mustSum100: 'must_sum_100',
    incomplete: 'incomplete',
    failed: 'failed'
} as const;

export type TargetResult = (typeof TARGET_RESULTS)[keyof typeof TARGET_RESULTS];

export interface PortfolioSettingsView {
    readonly baseCurrency: BaseCurrency;
    readonly toleranceBps: number;
}

export interface AssetTargetView {
    readonly subjectType: string;
    readonly subjectId: string;
    readonly targetInClassBps: number;
}

export interface AssetTargetsView {
    readonly classId: string;
    readonly targets: AssetTargetView[];
}

export interface AssetClassView {
    readonly id: string;
    readonly systemKey: string | null;
    readonly aliasKeys: string[];
    readonly name: string | null;
    readonly colorKey: string;
    readonly targetBps: number;
    readonly sortOrder: number;
}

export interface ClassAssignmentView {
    readonly subjectType: string;
    readonly subjectId: string;
    readonly classId: string;
    readonly targetInClassBps: number;
}
