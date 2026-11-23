import { ClassSummary, Holding, PortfolioSnapshot, sharesBpsOf } from '../../portfolio/services/portfolio-snapshot.service';
import { GoalKindKey, GoalSuggestion } from './contribution.types';

export interface GoalWish {
    readonly goalId: string;
    readonly kind: GoalKindKey;
    readonly name: string;
    readonly targetDate: string;
    readonly wantedMinor: number;
    readonly destination: { readonly kind: 'position' | 'fixed_income'; readonly holdingId: string };
}

export interface GoalAllocation {
    readonly goals: GoalSuggestion[];
    readonly goalsAmountMinor: number;
    readonly snapshot: PortfolioSnapshot;
}

function sumOf(values: Iterable<number>): number {
    return [...values].reduce((sum: number, value: number): number => sum + value, 0);
}

function suggestionOf(wish: GoalWish, holding: Holding, amountMinor: number): GoalSuggestion {
    return {
        goalId: wish.goalId,
        kind: wish.kind,
        name: wish.name,
        targetDate: wish.targetDate,
        amountMinor,
        destination: {
            kind: holding.kind,
            id: holding.id,
            symbol: holding.symbol,
            name: holding.name,
            typeGroup: holding.typeGroup,
            hint: holding.kind === 'fixed_income' ? 'new_or_reinforce' : null
        }
    };
}

function addedByClass(byHolding: ReadonlyMap<Holding, number>): Map<string, number> {
    const added: Map<string, number> = new Map<string, number>();
    for (const [holding, value] of byHolding) {
        if (holding.classId !== null) {
            added.set(holding.classId, (added.get(holding.classId) ?? 0) + value);
        }
    }
    return added;
}

function withValues(snapshot: PortfolioSnapshot, byHolding: ReadonlyMap<Holding, number>): PortfolioSnapshot {
    const totalMinor: number = snapshot.totalMinor + sumOf(byHolding.values());
    const added: Map<string, number> = addedByClass(byHolding);
    const values: number[] = snapshot.classes.map(
        (summary: ClassSummary): number => summary.valueMinor + (added.get(summary.classId) ?? 0)
    );
    const shares: number[] = sharesBpsOf(values, totalMinor);
    return {
        ...snapshot,
        totalMinor,
        holdings: snapshot.holdings.map((holding: Holding): Holding => ({
            ...holding,
            valueMinor: holding.valueMinor + (byHolding.get(holding) ?? 0)
        })),
        classes: snapshot.classes.map((summary: ClassSummary, index: number): ClassSummary => ({
            ...summary,
            valueMinor: values[index] ?? summary.valueMinor,
            shareBps: shares[index] ?? summary.shareBps
        }))
    };
}

export function allocateGoals(snapshot: PortfolioSnapshot, wishes: readonly GoalWish[], amountMinor: number): GoalAllocation {
    const holdings: Map<string, Holding> = new Map<string, Holding>(
        snapshot.holdings.map((holding: Holding): [string, Holding] => [`${holding.kind}:${holding.id}`, holding])
    );
    const byHolding: Map<Holding, number> = new Map<Holding, number>();
    const goals: GoalSuggestion[] = [];
    let left: number = amountMinor;
    for (const wish of wishes) {
        const holding: Holding | undefined = holdings.get(`${wish.destination.kind}:${wish.destination.holdingId}`);
        const given: number = Math.min(left, wish.wantedMinor);
        if (holding !== undefined && given > 0) {
            left -= given;
            byHolding.set(holding, (byHolding.get(holding) ?? 0) + given);
            goals.push(suggestionOf(wish, holding, given));
        }
    }
    return { goals, goalsAmountMinor: amountMinor - left, snapshot: withValues(snapshot, byHolding) };
}
