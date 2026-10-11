import { Injectable } from '@nestjs/common';
import { AccountDataExporterPort } from '../../identity/services/account-data-exporter.port';
import { CategoryRule, RULE_MATCH_TYPES, SpendingCategory } from '../domain/categories.types';
import { CategoryRuleDomain } from '../domain/category-rule.domain';
import { SpendingCategoryDomain } from '../domain/spending-category.domain';

export const SPENDING_CATEGORIES_EXPORT_AREA: string = 'spending_categories';

export interface SpendingCategoryExport {
    readonly id: string;
    readonly systemKey: string | null;
    readonly name: string | null;
    readonly kind: string;
    readonly flexibility: string | null;
    readonly icon: string;
    readonly position: number;
}

export interface CategoryRuleExport {
    readonly id: string;
    readonly categoryId: string;
    readonly matchType: string;
    readonly pattern: string | null;
    readonly label: string;
    readonly appliesTo: string;
    readonly createdAt: string;
}

export interface SpendingCategoriesExport {
    readonly categories: SpendingCategoryExport[];
    readonly rules: CategoryRuleExport[];
}

@Injectable()
export class SpendingCategoriesAccountExporter extends AccountDataExporterPort {
    public readonly area: string = SPENDING_CATEGORIES_EXPORT_AREA;

    public constructor(
        private readonly categories: SpendingCategoryDomain,
        private readonly rules: CategoryRuleDomain
    ) {
        super();
    }

    public async exportAll(): Promise<SpendingCategoriesExport> {
        const categories: SpendingCategory[] = await this.categories.listActive();
        const rules: CategoryRule[] = await this.rules.listActive();
        return {
            categories: categories.map((item: SpendingCategory): SpendingCategoryExport => this.categoryOf(item)),
            rules: rules
                .filter((rule: CategoryRule): boolean => !rule.isSample)
                .map((rule: CategoryRule): CategoryRuleExport => this.ruleOf(rule))
        };
    }

    private categoryOf(item: SpendingCategory): SpendingCategoryExport {
        return {
            id: item.id,
            systemKey: item.systemKey,
            name: item.name,
            kind: item.kind,
            flexibility: item.flexibility,
            icon: item.icon,
            position: item.position
        };
    }

    private ruleOf(rule: CategoryRule): CategoryRuleExport {
        return {
            id: rule.id,
            categoryId: rule.categoryId,
            matchType: rule.matchType,
            pattern: rule.matchType === RULE_MATCH_TYPES.counterparty ? null : rule.pattern,
            label: rule.label,
            appliesTo: rule.appliesTo,
            createdAt: rule.createdAt.toISOString()
        };
    }
}
