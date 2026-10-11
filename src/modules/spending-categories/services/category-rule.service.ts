import { Injectable } from '@nestjs/common';
import {
    CorrectionRuleInput,
    CategoryRule,
    RULE_ACTIONS,
    RULE_LABEL_MAX_LENGTH,
    RULE_MATCH_TYPES,
    RuleMatchType
} from '../domain/categories.types';
import { CategoryRuleDomain } from '../domain/category-rule.domain';
import { toMatchType } from '../domain/category.mapper';
import { CategoryReaderService } from './category-reader.service';
import { normalizeDescription } from './description-normalizer.service';
import { SpendingCategoriesLogService } from './spending-categories-log.service';
import { SpendingCategoriesMetricsService } from './spending-categories-metrics.service';

@Injectable()
export class CategoryRuleService {
    public constructor(
        private readonly rules: CategoryRuleDomain,
        private readonly reader: CategoryReaderService,
        private readonly logs: SpendingCategoriesLogService,
        private readonly metrics: SpendingCategoriesMetricsService
    ) {}

    public async listForCompany(): Promise<readonly CategoryRule[]> {
        return this.rules.listActive();
    }

    public async upsertFromCorrection(input: CorrectionRuleInput): Promise<CategoryRule> {
        await this.reader.requireById(input.categoryId);
        const pattern: string = input.matchType === RULE_MATCH_TYPES.counterparty ? input.pattern : normalizeDescription(input.pattern);
        const label: string = input.label.slice(0, RULE_LABEL_MAX_LENGTH);
        const existing: CategoryRule | null = await this.rules.findByMatch(input.matchType, pattern, input.appliesTo);
        const saved: CategoryRule =
            existing === null
                ? await this.rules.create({
                      categoryId: input.categoryId,
                      matchType: input.matchType,
                      pattern,
                      label,
                      appliesTo: input.appliesTo
                  })
                : ((await this.rules.update(existing.id, { categoryId: input.categoryId, label }, existing)) ?? existing);
        this.record(saved, existing === null ? RULE_ACTIONS.learned : RULE_ACTIONS.updated);
        return saved;
    }

    private record(rule: CategoryRule, action: typeof RULE_ACTIONS.learned | typeof RULE_ACTIONS.updated): void {
        const matchType: RuleMatchType = toMatchType(rule.matchType);
        this.logs.ruleWritten(rule.id, matchType, action, 0);
        this.metrics.ruleAction(action, matchType);
    }
}
