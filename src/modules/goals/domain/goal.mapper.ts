import { DateUtil } from '../../../shared/utils/date.util';
import { Goal, GoalHoldingKind, GoalHoldingLink, GoalHoldingRow, GoalKind, GoalMonthStart, GoalPlan, GoalRow } from './goals.types';

export function toGoal(row: GoalRow, holdings: readonly GoalHoldingRow[]): Goal {
    return {
        id: row.id,
        kind: row.kind as GoalKind,
        name: row.name,
        targetMinor: Number(row.targetMinor),
        targetDate: DateUtil.onlyLocalDateString(new Date(row.targetDate)),
        holderUserId: row.holderUserId,
        manualMinor: Number(row.manualMinor),
        manualUpdatedAt: row.manualUpdatedAt === null ? null : new Date(row.manualUpdatedAt),
        plan: toPlan(row),
        monthStart: toMonthStart(row),
        holdings: holdings.map(toLink),
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt)
    };
}

function toLink(row: GoalHoldingRow): GoalHoldingLink {
    return { kind: row.holdingKind as GoalHoldingKind, holdingId: row.holdingId, shareBps: row.shareBps };
}

function toPlan(row: GoalRow): GoalPlan {
    return {
        startMonth: DateUtil.onlyLocalDateString(new Date(row.planStartMonth)),
        startMinor: Number(row.planStartMinor),
        months: row.planMonths
    };
}

function toMonthStart(row: GoalRow): GoalMonthStart {
    return { month: DateUtil.onlyLocalDateString(new Date(row.monthStartMonth)), minor: Number(row.monthStartMinor) };
}
