import { RuleDirection, RuleMatchType } from '../domain/categories.types';

export interface RuleMatcher {
    readonly matchType: RuleMatchType;
    readonly pattern: string;
    readonly appliesTo: RuleDirection;
}

export type RecategorizationScope =
    | { readonly kind: 'rule_saved'; readonly ruleId: string }
    | { readonly kind: 'rule_removed'; readonly ruleId: string }
    | { readonly kind: 'category_removed'; readonly categoryId: string; readonly moveToCategoryId: string | null };

export abstract class RecategorizationPort {
    public abstract recategorize(scope: RecategorizationScope): Promise<number>;
    public abstract countMatches(matcher: RuleMatcher): Promise<number>;
}
