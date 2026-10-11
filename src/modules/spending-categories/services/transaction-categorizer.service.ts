import { Injectable } from '@nestjs/common';
import {
    CATEGORIZATION_SOURCES,
    CategorizationInput,
    CategorizationResult,
    CategorizationSource,
    CategoryRule,
    SpendingCategory
} from '../domain/categories.types';
import { CategoryRuleDomain } from '../domain/category-rule.domain';
import { DictionaryEntry } from '../validation/data.schemas';
import { MERCHANT_DICTIONARY, matchDictionary } from '../domain/dictionary-matcher';
import { PLUGGY_CATEGORY_INDEX, mapPluggyCategory } from '../domain/pluggy-category-mapper';
import { findWinningRule, sortByPrecedence } from '../domain/rule-precedence';
import { CategoryReaderService } from './category-reader.service';
import { SpendingCategoriesMetricsService } from './spending-categories-metrics.service';

interface CategorizationContext {
    readonly rules: readonly CategoryRule[];
    readonly idBySystemKey: ReadonlyMap<string, string>;
}

const UNCATEGORIZED: CategorizationResult = { categoryId: null, source: CATEGORIZATION_SOURCES.none, ruleId: null };

@Injectable()
export class TransactionCategorizerService {
    public constructor(
        private readonly reader: CategoryReaderService,
        private readonly rules: CategoryRuleDomain,
        private readonly metrics: SpendingCategoriesMetricsService
    ) {}

    public async categorize(input: CategorizationInput): Promise<CategorizationResult> {
        const [result] = await this.categorizeMany([input]);
        return result ?? UNCATEGORIZED;
    }

    public async categorizeMany(inputs: readonly CategorizationInput[]): Promise<readonly CategorizationResult[]> {
        if (inputs.length === 0) {
            return [];
        }
        const context: CategorizationContext = await this.loadContext();
        const results: CategorizationResult[] = inputs.map((input: CategorizationInput) => this.categorizeOne(context, input));
        this.recordSources(results);
        return results;
    }

    private async loadContext(): Promise<CategorizationContext> {
        const categories: readonly SpendingCategory[] = await this.reader.listForCompany();
        const activeIds: ReadonlySet<string> = new Set<string>(categories.map((category: SpendingCategory) => category.id));
        const rules: CategoryRule[] = await this.rules.listActive();
        const systemEntries: [string, string][] = categories.flatMap((category: SpendingCategory): [string, string][] =>
            category.systemKey === null ? [] : [[category.systemKey, category.id]]
        );
        return {
            rules: sortByPrecedence(rules.filter((rule: CategoryRule): boolean => activeIds.has(rule.categoryId))),
            idBySystemKey: new Map<string, string>(systemEntries)
        };
    }

    private categorizeOne(context: CategorizationContext, input: CategorizationInput): CategorizationResult {
        return this.byRule(context, input) ?? this.byProvider(context, input) ?? this.byDictionary(context, input) ?? UNCATEGORIZED;
    }

    private byRule(context: CategorizationContext, input: CategorizationInput): CategorizationResult | null {
        const rule: CategoryRule | null = findWinningRule(context.rules, input);
        return rule === null ? null : { categoryId: rule.categoryId, source: CATEGORIZATION_SOURCES.rule, ruleId: rule.id };
    }

    private byDictionary(context: CategorizationContext, input: CategorizationInput): CategorizationResult | null {
        const entry: DictionaryEntry | null = matchDictionary(MERCHANT_DICTIONARY, input.normalizedDescription, input.amountMinor);
        return entry === null ? null : this.bySystemKey(context, entry.category, CATEGORIZATION_SOURCES.dictionary);
    }

    private byProvider(context: CategorizationContext, input: CategorizationInput): CategorizationResult | null {
        const systemKey: string | null = mapPluggyCategory(PLUGGY_CATEGORY_INDEX, input.providerCategoryId, input.amountMinor);
        return systemKey === null ? null : this.bySystemKey(context, systemKey, CATEGORIZATION_SOURCES.provider);
    }

    private bySystemKey(context: CategorizationContext, systemKey: string, source: CategorizationSource): CategorizationResult | null {
        const categoryId: string | undefined = context.idBySystemKey.get(systemKey);
        return categoryId === undefined ? null : { categoryId, source, ruleId: null };
    }

    private recordSources(results: readonly CategorizationResult[]): void {
        const counts: Map<CategorizationSource, number> = new Map<CategorizationSource, number>();
        for (const result of results) {
            counts.set(result.source, (counts.get(result.source) ?? 0) + 1);
        }
        for (const [source, amount] of counts) {
            this.metrics.categorized(source, amount);
        }
    }
}
