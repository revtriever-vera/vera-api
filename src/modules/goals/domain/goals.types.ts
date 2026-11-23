import { Insertable, Selectable, Updateable } from 'kysely';
import { GoalHoldings, Goals } from '../../../core/database/generated/database.types';

export type GoalRow = Selectable<Goals>;
export type NewGoal = Insertable<Goals>;
export type GoalPatch = Updateable<Goals>;
export type GoalHoldingRow = Selectable<GoalHoldings>;

export const GOAL_KINDS = {
    emergencyReserve: 'emergency_reserve',
    travel: 'travel',
    homeDownPayment: 'home_down_payment',
    other: 'other'
} as const;

export type GoalKind = (typeof GOAL_KINDS)[keyof typeof GOAL_KINDS];

export const GOAL_HOLDING_KINDS = {
    position: 'position',
    fixedIncome: 'fixed_income'
} as const;

export type GoalHoldingKind = (typeof GOAL_HOLDING_KINDS)[keyof typeof GOAL_HOLDING_KINDS];

export const GOAL_STATUSES = {
    done: 'done',
    overdue: 'overdue',
    behind: 'behind',
    onTrack: 'on_track'
} as const;

export type GoalStatus = (typeof GOAL_STATUSES)[keyof typeof GOAL_STATUSES];

export const RESERVE_MONTH_OPTIONS = [3, 6, 12] as const;
export const DEFAULT_RESERVE_MONTHS: number = 6;
export const BPS_BASE: number = 10_000;
export const RESERVE_CHANGE_THRESHOLD_BPS: number = 1000;
export const MAX_GOALS_PER_COMPANY: number = 20;
export const MAX_HOLDINGS_PER_GOAL: number = 50;
export const MAX_NAME_LENGTH: number = 60;
export const FULL_SHARE_BPS: number = 10000;
export const PLAN_SLACK_BPS: number = 5000;

export interface GoalHoldingLink {
    readonly kind: GoalHoldingKind;
    readonly holdingId: string;
    readonly shareBps: number;
}

export interface GoalPlan {
    readonly startMonth: string;
    readonly startMinor: number;
    readonly months: number;
}

export interface GoalMonthStart {
    readonly month: string;
    readonly minor: number;
}

export interface ReserveBasis {
    readonly months: number;
    readonly baseMinor: number;
}

export interface Goal {
    readonly id: string;
    readonly kind: GoalKind;
    readonly name: string;
    readonly targetMinor: number;
    readonly targetDate: string;
    readonly holderUserId: string | null;
    readonly manualMinor: number;
    readonly manualUpdatedAt: Date | null;
    readonly plan: GoalPlan;
    readonly monthStart: GoalMonthStart;
    readonly reserve: ReserveBasis | null;
    readonly holdings: readonly GoalHoldingLink[];
    readonly createdAt: Date;
    readonly updatedAt: Date;
}

export interface LinkValue {
    readonly shareBps: number;
    readonly holdingValueMinor: number | null;
}

export interface GoalProgress {
    readonly balanceMinor: number;
    readonly remainingMinor: number;
    readonly monthlyMinor: number;
    readonly monthsRemaining: number;
    readonly expectedMinor: number;
    readonly planMonthlyMinor: number;
    readonly status: GoalStatus;
    readonly monthDeltaMinor: number | null;
    readonly removedHoldings: number;
}

export interface NewGoalData {
    readonly kind: GoalKind;
    readonly name: string;
    readonly targetMinor: number;
    readonly targetDate: string;
    readonly holderUserId: string | null;
    readonly manualMinor: number;
    readonly plan: GoalPlan;
    readonly monthStart: GoalMonthStart;
    readonly reserve: ReserveBasis | null;
    readonly isSample?: boolean;
}

export interface GoalChanges {
    readonly name?: string;
    readonly targetMinor?: number;
    readonly targetDate?: string;
    readonly holderUserId?: string | null;
    readonly manualMinor?: number;
    readonly plan?: GoalPlan;
    readonly reserve?: ReserveBasis;
}

export interface CreateGoalInput {
    readonly kind: GoalKind;
    readonly name: string;
    readonly targetMinor: number;
    readonly targetDate: string;
    readonly holderUserId?: string | null;
    readonly manualMinor?: number;
    readonly reserveMonths?: number;
    readonly holdings: readonly GoalHoldingLink[];
}

export interface UpdateGoalInput {
    readonly name?: string;
    readonly targetMinor?: number;
    readonly targetDate?: string;
    readonly holderUserId?: string | null;
    readonly manualMinor?: number;
    readonly reserveMonths?: number;
    readonly holdings?: readonly GoalHoldingLink[];
}
