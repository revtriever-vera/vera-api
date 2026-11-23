import { Holding, PortfolioSnapshot } from '../../portfolio/services/portfolio-snapshot.service';
import { balanceOf, progressOf, shareOfMinor } from '../domain/goal-calculator';
import { ReserveReview } from '../domain/reserve-review';
import { holdingKeyOf } from '../domain/goal.domain';
import { Goal, GOAL_STATUSES, GoalHoldingLink, GoalProgress, LinkValue } from '../domain/goals.types';
import { GoalsList, GoalView } from '../validation/goals.schemas';

export type HoldingIndex = ReadonlyMap<string, Holding>;

export function indexHoldings(snapshot: PortfolioSnapshot): HoldingIndex {
    return new Map(snapshot.holdings.map((holding: Holding): [string, Holding] => [holdingKeyOf(holding.kind, holding.id), holding]));
}

export function linkValuesOf(links: readonly GoalHoldingLink[], holdings: HoldingIndex): LinkValue[] {
    return links.map((link: GoalHoldingLink): LinkValue => ({
        shareBps: link.shareBps,
        holdingValueMinor: holdings.get(holdingKeyOf(link.kind, link.holdingId))?.valueMinor ?? null
    }));
}

export function balanceOfLinks(manualMinor: number, links: readonly GoalHoldingLink[], holdings: HoldingIndex): number {
    return balanceOf(manualMinor, linkValuesOf(links, holdings));
}

export function toGoalView(goal: Goal, holdings: HoldingIndex, today: string, reserve: ReserveReview | null = null): GoalView {
    const progress: GoalProgress = progressOf(goal, linkValuesOf(goal.holdings, holdings), today);
    return {
        id: goal.id,
        kind: goal.kind,
        name: goal.name,
        targetMinor: goal.targetMinor,
        targetDate: goal.targetDate,
        holderUserId: goal.holderUserId,
        manualMinor: goal.manualMinor,
        manualUpdatedAt: goal.manualUpdatedAt?.toISOString() ?? null,
        ...progress,
        reserve,
        holdings: goal.holdings.map((link: GoalHoldingLink) => toHoldingView(link, holdings)),
        createdAt: goal.createdAt.toISOString(),
        updatedAt: goal.updatedAt.toISOString()
    };
}

function toHoldingView(link: GoalHoldingLink, holdings: HoldingIndex): GoalView['holdings'][number] {
    const holding: Holding | undefined = holdings.get(holdingKeyOf(link.kind, link.holdingId));
    return {
        kind: link.kind,
        holdingId: link.holdingId,
        shareBps: link.shareBps,
        removed: holding === undefined,
        symbol: holding?.assetId === null || holding === undefined ? null : holding.symbol,
        name: holding?.name ?? null,
        valueMinor: holding === undefined ? null : shareOfMinor(holding.valueMinor, link.shareBps)
    };
}

export function toGoalsList(views: readonly GoalView[]): GoalsList {
    const open: GoalView[] = views.filter((view: GoalView): boolean => view.status !== GOAL_STATUSES.done);
    return {
        items: [...views],
        totals: {
            count: views.length,
            monthlyNeededMinor: open.reduce((sum: number, view: GoalView): number => sum + view.monthlyMinor, 0),
            onTrackCount: views.filter((view: GoalView): boolean => view.status === GOAL_STATUSES.onTrack).length,
            behindCount: views.filter(
                (view: GoalView): boolean => view.status === GOAL_STATUSES.behind || view.status === GOAL_STATUSES.overdue
            ).length,
            doneCount: views.length - open.length
        }
    };
}
