import { RULE_DIRECTIONS, RuleDirection } from './categories.types';

export function matchesDirection(appliesTo: RuleDirection, amountMinor: number): boolean {
    if (appliesTo === RULE_DIRECTIONS.out) {
        return amountMinor < 0;
    }
    if (appliesTo === RULE_DIRECTIONS.in) {
        return amountMinor > 0;
    }
    return true;
}
