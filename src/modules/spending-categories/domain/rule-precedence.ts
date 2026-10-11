import { CategoryRule, RULE_MATCH_TYPES, RuleMatchType } from './categories.types';
import { toDirection, toMatchType } from './category.mapper';
import { matchesDirection } from './direction';

export interface RuleSubject {
    readonly amountMinor: number;
    readonly normalizedDescription: string;
    readonly counterpartyKey: string | null;
}

const TYPE_RANK: Readonly<Record<RuleMatchType, number>> = {
    [RULE_MATCH_TYPES.counterparty]: 0,
    [RULE_MATCH_TYPES.description]: 1,
    [RULE_MATCH_TYPES.contains]: 2
};

export function compareRules(a: CategoryRule, b: CategoryRule): number {
    const byType: number = TYPE_RANK[toMatchType(a.matchType)] - TYPE_RANK[toMatchType(b.matchType)];
    if (byType !== 0) {
        return byType;
    }
    const byLength: number = b.pattern.length - a.pattern.length;
    if (byLength !== 0) {
        return byLength;
    }
    const byRecency: number = b.updatedAt.getTime() - a.updatedAt.getTime();
    return byRecency !== 0 ? byRecency : b.id.localeCompare(a.id);
}

export function sortByPrecedence(rules: readonly CategoryRule[]): CategoryRule[] {
    return [...rules].sort(compareRules);
}

function matchesText(rule: CategoryRule, subject: RuleSubject): boolean {
    const matchType: RuleMatchType = toMatchType(rule.matchType);
    if (matchType === RULE_MATCH_TYPES.counterparty) {
        return subject.counterpartyKey !== null && subject.counterpartyKey === rule.pattern;
    }
    if (matchType === RULE_MATCH_TYPES.description) {
        return subject.normalizedDescription === rule.pattern;
    }
    return subject.normalizedDescription.includes(rule.pattern);
}

export function ruleMatches(rule: CategoryRule, subject: RuleSubject): boolean {
    return matchesDirection(toDirection(rule.appliesTo), subject.amountMinor) && matchesText(rule, subject);
}

export function findWinningRule(sortedRules: readonly CategoryRule[], subject: RuleSubject): CategoryRule | null {
    return sortedRules.find((rule: CategoryRule): boolean => ruleMatches(rule, subject)) ?? null;
}
