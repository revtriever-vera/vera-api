import { Insertable, Selectable } from 'kysely';
import { AssetClassAssignments, AssetClasses } from '../../../core/database/generated/database.types';

export type AssetClass = Selectable<AssetClasses>;
export type ClassAssignment = Selectable<AssetClassAssignments>;

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
