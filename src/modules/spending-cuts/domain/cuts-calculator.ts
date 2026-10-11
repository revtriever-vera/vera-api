import { DecimalUtil } from '../../../shared/utils/decimal.util';
import type { MonthlySummary } from '../../spending-summary/services/spending-summary.service';
import { allocateCuts } from './cut-allocator';
import { resolveCutStatus } from './cut-status';
import {
    BPS_BASE,
    CUT_STATUSES,
    CutAllocation,
    CutCandidate,
    CutPlan,
    CutStatus,
    CutsResult,
    CutSuggestion,
    MIN_COUNTED_CUT_MINOR
} from './spending-cuts.types';

type SummaryCategory = MonthlySummary['categories'][number];

type CutTotalKeys = 'totalCutMinor' | 'flexibleTotalMinor' | 'excessTotalMinor' | 'categoriesWithCut';

const MONTHS_PER_YEAR: number = 12;
const FLEXIBLE: string = 'flexible';

export function limitMonthOf(month: string): string {
    const [yearPart, monthPart]: string[] = month.split('-');
    const index: number = Number(yearPart) * MONTHS_PER_YEAR + Number(monthPart);
    const year: number = Math.floor(index / MONTHS_PER_YEAR);
    return `${String(year).padStart(4, '0')}-${String((index % MONTHS_PER_YEAR) + 1).padStart(2, '0')}`;
}

function candidatesOf(summary: MonthlySummary): readonly SummaryCategory[] {
    return summary.categories.filter((category: SummaryCategory): boolean => category.flexibility === FLEXIBLE && category.spentMinor > 0);
}

interface Goal {
    readonly bps: number;
    readonly minor: number;
    readonly gapMinor: number;
}

function goalOf(summary: MonthlySummary, simulatedBps: number | undefined): Goal {
    if (simulatedBps === undefined) {
        return { bps: summary.goal.bps, minor: summary.goal.minor, gapMinor: summary.gapMinor };
    }
    const minor: number = DecimalUtil.roundHalfUpToInteger(DecimalUtil.of(summary.income.minor).mul(simulatedBps).div(BPS_BASE));
    return { bps: simulatedBps, minor, gapMinor: Math.max(0, minor - summary.savedMinor) };
}

function toSuggestion(category: SummaryCategory, allocation: CutAllocation): CutSuggestion {
    return {
        categoryId: category.categoryId,
        systemKey: category.systemKey,
        name: category.name,
        icon: category.icon,
        spentMinor: category.spentMinor,
        averageMinor: category.averageMinor,
        excessMinor: allocation.excessMinor,
        cutMinor: allocation.cutMinor,
        limitMinor: category.spentMinor - allocation.cutMinor
    };
}

function suggestionsOf(status: CutStatus, categories: readonly SummaryCategory[], plan: CutPlan): readonly CutSuggestion[] {
    if (status === CUT_STATUSES.noData || status === CUT_STATUSES.noIncome) {
        return [];
    }
    const byKey: Map<string, CutAllocation> = new Map<string, CutAllocation>(
        plan.allocations.map((allocation: CutAllocation): [string, CutAllocation] => [allocation.key, allocation])
    );
    return categories
        .map((category: SummaryCategory): CutSuggestion => toSuggestion(category, byKey.get(category.categoryId) as CutAllocation))
        .sort((left: CutSuggestion, right: CutSuggestion): number => right.cutMinor - left.cutMinor || right.spentMinor - left.spentMinor);
}

function candidateOf(category: SummaryCategory): CutCandidate {
    return {
        key: category.categoryId,
        tieKey: category.systemKey ?? category.categoryId,
        spentMinor: category.spentMinor,
        averageMinor: category.averageMinor
    };
}

function planFor(status: CutStatus, gapMinor: number, categories: readonly SummaryCategory[]): CutPlan {
    const needsCut: boolean = status === CUT_STATUSES.cutSuggested || status === CUT_STATUSES.exceedsFlexible;
    return allocateCuts(needsCut ? gapMinor : 0, categories.map(candidateOf));
}

function sumOf(values: readonly number[]): number {
    return values.reduce((sum: number, value: number): number => sum + value, 0);
}

function headerOf(
    summary: MonthlySummary,
    goal: Goal,
    simulated: boolean,
    status: CutStatus
): Omit<CutsResult, 'suggestions' | CutTotalKeys> {
    return {
        month: summary.month,
        limitMonth: limitMonthOf(summary.month),
        isPartial: summary.isPartial,
        status,
        goal: { bps: goal.bps, minor: goal.minor, simulated },
        incomeMinor: summary.income.minor,
        savedMinor: summary.savedMinor,
        savingsRateBps: summary.savingsRateBps,
        gapMinor: goal.gapMinor,
        surplusMinor: status === CUT_STATUSES.goalMet ? Math.max(0, summary.savedMinor - goal.minor) : 0,
        uncategorizedMinor: summary.uncategorizedMinor,
        averageMonths: summary.averageMonths
    };
}

function totalsOf(suggestions: readonly CutSuggestion[], flexibleTotalMinor: number, plan: CutPlan): Pick<CutsResult, CutTotalKeys> {
    return {
        totalCutMinor: sumOf(suggestions.map((item: CutSuggestion): number => item.cutMinor)),
        flexibleTotalMinor,
        excessTotalMinor: plan.excessTotalMinor,
        categoriesWithCut: suggestions.filter((item: CutSuggestion): boolean => item.cutMinor >= MIN_COUNTED_CUT_MINOR).length
    };
}

export function calculateCuts(summary: MonthlySummary, simulatedBps: number | undefined): CutsResult {
    const goal: Goal = goalOf(summary, simulatedBps);
    const categories: readonly SummaryCategory[] = candidatesOf(summary);
    const flexibleTotalMinor: number = sumOf(categories.map((category: SummaryCategory): number => category.spentMinor));
    const status: CutStatus = resolveCutStatus({
        hasData: summary.hasData,
        incomeMinor: summary.income.minor,
        gapMinor: goal.gapMinor,
        flexibleTotalMinor
    });
    const plan: CutPlan = planFor(status, goal.gapMinor, categories);
    const suggestions: readonly CutSuggestion[] = suggestionsOf(status, categories, plan);
    return {
        ...headerOf(summary, goal, simulatedBps !== undefined, status),
        ...totalsOf(suggestions, flexibleTotalMinor, plan),
        suggestions
    };
}
