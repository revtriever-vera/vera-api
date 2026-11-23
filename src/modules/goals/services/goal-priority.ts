import { Holding, PortfolioSnapshot } from '../../portfolio/services/portfolio-snapshot.service';
import { progressOf } from '../domain/goal-calculator';
import { holdingKeyOf } from '../domain/goal.domain';
import { Goal, GOAL_STATUSES, GoalHoldingKind, GoalHoldingLink, GoalKind, GoalProgress } from '../domain/goals.types';
import { HoldingIndex, indexHoldings, linkValuesOf } from './goal-view.mapper';

export interface GoalPriority {
    readonly goalId: string;
    readonly kind: GoalKind;
    readonly name: string;
    readonly targetDate: string;
    readonly wantedMinor: number;
    readonly destination: { readonly kind: GoalHoldingKind; readonly holdingId: string };
}

function destinationOf(links: readonly GoalHoldingLink[], holdings: HoldingIndex): GoalHoldingLink | null {
    const eligible: GoalHoldingLink[] = links.filter((link: GoalHoldingLink): boolean => {
        const holding: Holding | undefined = holdings.get(holdingKeyOf(link.kind, link.holdingId));
        return holding !== undefined && !holding.matured;
    });
    const sorted: GoalHoldingLink[] = eligible.toSorted(
        (left: GoalHoldingLink, right: GoalHoldingLink): number =>
            right.shareBps - left.shareBps || left.holdingId.localeCompare(right.holdingId)
    );
    return sorted[0] ?? null;
}

export function wantedMinorOf(progress: GoalProgress): number {
    return Math.min(progress.remainingMinor, Math.max(progress.expectedMinor - progress.balanceMinor, progress.monthlyMinor));
}

function priorityOf(goal: Goal, holdings: HoldingIndex, today: string): GoalPriority | null {
    const progress: GoalProgress = progressOf(goal, linkValuesOf(goal.holdings, holdings), today);
    const late: boolean = progress.status === GOAL_STATUSES.behind || progress.status === GOAL_STATUSES.overdue;
    const destination: GoalHoldingLink | null = destinationOf(goal.holdings, holdings);
    const wantedMinor: number = wantedMinorOf(progress);
    if (!late || destination === null || wantedMinor <= 0) {
        return null;
    }
    return {
        goalId: goal.id,
        kind: goal.kind,
        name: goal.name,
        targetDate: goal.targetDate,
        wantedMinor,
        destination: { kind: destination.kind, holdingId: destination.holdingId }
    };
}

export function prioritiesOf(goals: readonly Goal[], snapshot: PortfolioSnapshot, today: string): GoalPriority[] {
    const holdings: HoldingIndex = indexHoldings(snapshot);
    return goals
        .map((goal: Goal): GoalPriority | null => priorityOf(goal, holdings, today))
        .filter((priority: GoalPriority | null): priority is GoalPriority => priority !== null)
        .toSorted(
            (left: GoalPriority, right: GoalPriority): number =>
                left.targetDate.localeCompare(right.targetDate) || left.goalId.localeCompare(right.goalId)
        );
}
