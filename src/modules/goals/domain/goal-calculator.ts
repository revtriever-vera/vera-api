import { FULL_SHARE_BPS, Goal, GOAL_STATUSES, GoalPlan, GoalProgress, GoalStatus, LinkValue, PLAN_SLACK_BPS } from './goals.types';

const MONTHS_IN_YEAR: number = 12;
const HALF_BPS: bigint = BigInt(FULL_SHARE_BPS / 2);
const BPS: bigint = BigInt(FULL_SHARE_BPS);

export function monthIndexOf(isoDate: string): number {
    const [year, month]: string[] = isoDate.split('-');
    return Number(year) * MONTHS_IN_YEAR + Number(month) - 1;
}

export function firstOfMonth(isoDate: string): string {
    return `${isoDate.slice(0, 7)}-01`;
}

export function monthsRemaining(today: string, targetDate: string): number {
    return Math.max(1, monthIndexOf(targetDate) - monthIndexOf(today));
}

export function planMonthsBetween(startMonth: string, targetDate: string): number {
    return Math.max(1, monthIndexOf(targetDate) - monthIndexOf(startMonth));
}

export function shareOfMinor(valueMinor: number, shareBps: number): number {
    return Number((BigInt(valueMinor) * BigInt(shareBps) + HALF_BPS) / BPS);
}

export function balanceOf(manualMinor: number, links: readonly LinkValue[]): number {
    return links.reduce(
        (sum: number, link: LinkValue): number =>
            link.holdingValueMinor === null ? sum : sum + shareOfMinor(link.holdingValueMinor, link.shareBps),
        manualMinor
    );
}

export function planMonthlyOf(targetMinor: number, plan: GoalPlan): number {
    return Math.ceil(Math.max(0, targetMinor - plan.startMinor) / plan.months);
}

export function expectedOf(targetMinor: number, plan: GoalPlan, today: string): number {
    const elapsed: number = Math.min(plan.months, Math.max(0, monthIndexOf(today) - monthIndexOf(plan.startMonth)));
    return plan.startMinor + Math.round(((targetMinor - plan.startMinor) * elapsed) / plan.months);
}

export function statusOf(goal: Goal, balanceMinor: number, expectedMinor: number, planMonthlyMinor: number, today: string): GoalStatus {
    if (balanceMinor >= goal.targetMinor) {
        return GOAL_STATUSES.done;
    }
    if (today > goal.targetDate) {
        return GOAL_STATUSES.overdue;
    }
    const slackTwiceMinor: number = (planMonthlyMinor * PLAN_SLACK_BPS * 2) / FULL_SHARE_BPS;
    return balanceMinor * 2 < expectedMinor * 2 - slackTwiceMinor ? GOAL_STATUSES.behind : GOAL_STATUSES.onTrack;
}

export function progressOf(goal: Goal, links: readonly LinkValue[], today: string): GoalProgress {
    const balanceMinor: number = balanceOf(goal.manualMinor, links);
    const remainingMinor: number = Math.max(0, goal.targetMinor - balanceMinor);
    const remainingMonths: number = monthsRemaining(today, goal.targetDate);
    const expectedMinor: number = expectedOf(goal.targetMinor, goal.plan, today);
    const planMonthlyMinor: number = planMonthlyOf(goal.targetMinor, goal.plan);
    return {
        balanceMinor,
        remainingMinor,
        monthlyMinor: Math.ceil(remainingMinor / remainingMonths),
        monthsRemaining: remainingMonths,
        expectedMinor,
        planMonthlyMinor,
        status: statusOf(goal, balanceMinor, expectedMinor, planMonthlyMinor, today),
        monthDeltaMinor: goal.monthStart.month === firstOfMonth(today) ? balanceMinor - goal.monthStart.minor : null,
        removedHoldings: links.filter((link: LinkValue): boolean => link.holdingValueMinor === null).length
    };
}
