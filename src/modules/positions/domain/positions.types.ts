import { Insertable, Selectable, Updateable } from 'kysely';
import { Positions } from '../../../core/database/generated/database.types';

export type Position = Selectable<Positions>;
export type NewPosition = Insertable<Positions>;
export type PositionPatch = Updateable<Positions>;

export const POSITION_ACTIONS = {
    created: 'created',
    updated: 'updated',
    removed: 'removed'
} as const;

export type PositionAction = (typeof POSITION_ACTIONS)[keyof typeof POSITION_ACTIONS];

export const ACTIVE_ASSET_STATUS: string = 'active';
export const MAX_POSITIONS_PER_COMPANY: number = 500;
export const POSITION_SUBJECT_TYPE = 'position' as const;

export const QUANTITY_PATTERN: RegExp = /^\d{1,18}(\.\d{1,10})?$/;
export const AVERAGE_PRICE_PATTERN: RegExp = /^\d{1,16}(\.\d{1,8})?$/;

export interface PositionView {
    readonly id: string;
    readonly assetId: string;
    readonly quantity: string;
    readonly averagePrice: string | null;
    readonly classId: string;
    readonly createdAt: string;
    readonly updatedAt: string;
}

export interface CreatePositionInput {
    readonly assetId: string;
    readonly quantity: string;
    readonly averagePrice?: string | null;
    readonly classId?: string;
}

export interface UpdatePositionInput {
    readonly quantity?: string;
    readonly averagePrice?: string | null;
}
