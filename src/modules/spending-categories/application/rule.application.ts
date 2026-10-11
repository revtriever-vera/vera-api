import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { InvalidRuleError, RuleNotFoundError } from '../domain/categories.errors';
import {
    CategoryRule,
    RULE_ACTIONS,
    RULE_LABEL_MAX_LENGTH,
    RULE_MATCH_TYPES,
    RULE_PATTERN_MAX_LENGTH,
    RULE_PATTERN_MIN_LENGTH,
    RuleAction,
    RuleDirection,
    RuleMatchType,
    RuleView
} from '../domain/categories.types';
import { CategoryRuleDomain } from '../domain/category-rule.domain';
import { toMatchType, toRuleView } from '../domain/category.mapper';
import { CategoryReaderService } from '../services/category-reader.service';
import { normalizeDescription } from '../services/description-normalizer.service';
import { RecategorizationRegistry } from '../services/recategorization.registry';
import { SpendingCategoriesLogService } from '../services/spending-categories-log.service';
import { SpendingCategoriesMetricsService } from '../services/spending-categories-metrics.service';

export interface CreateRulePayload {
    readonly matchType: Extract<RuleMatchType, 'description' | 'contains'>;
    readonly pattern: string;
    readonly appliesTo: RuleDirection;
    readonly categoryId: string;
    readonly applyToPast: boolean;
}

export interface PreviewRulePayload {
    readonly matchType: Extract<RuleMatchType, 'description' | 'contains'>;
    readonly pattern: string;
    readonly appliesTo: RuleDirection;
}

export interface UpdateRulePayload {
    readonly categoryId?: string;
    readonly appliesTo?: RuleDirection;
}

export interface RuleSavedView {
    readonly rule: RuleView;
    readonly recategorized: number;
}

export interface RulePreviewView {
    readonly normalizedPattern: string;
    readonly matches: number;
}

@Injectable()
export class RuleApplication {
    public constructor(
        private readonly rules: CategoryRuleDomain,
        private readonly reader: CategoryReaderService,
        private readonly recategorization: RecategorizationRegistry,
        private readonly logs: SpendingCategoriesLogService,
        private readonly metrics: SpendingCategoriesMetricsService
    ) {}

    public async list(): Promise<RuleView[]> {
        const rules: CategoryRule[] = await this.rules.listActive();
        return rules.map(toRuleView);
    }

    public async preview(payload: PreviewRulePayload): Promise<RulePreviewView> {
        const normalizedPattern: string = this.normalizedPattern(payload.matchType, payload.pattern);
        const matches: number = await this.recategorization.countMatches({
            matchType: payload.matchType,
            pattern: normalizedPattern,
            appliesTo: payload.appliesTo
        });
        return { normalizedPattern, matches };
    }

    @UsingTransaction()
    public async create(payload: CreateRulePayload): Promise<RuleSavedView> {
        const pattern: string = this.normalizedPattern(payload.matchType, payload.pattern);
        await this.reader.requireById(payload.categoryId);
        const created: CategoryRule = await this.rules.create({
            categoryId: payload.categoryId,
            matchType: payload.matchType,
            pattern,
            label: payload.pattern.slice(0, RULE_LABEL_MAX_LENGTH),
            appliesTo: payload.appliesTo
        });
        const recategorized: number = payload.applyToPast
            ? await this.recategorization.recategorize({ kind: 'rule_saved', ruleId: created.id })
            : 0;
        this.record(created, RULE_ACTIONS.created, recategorized);
        return { rule: toRuleView(created), recategorized };
    }

    @UsingTransaction()
    public async update(id: string, payload: UpdateRulePayload): Promise<RuleSavedView> {
        const current: CategoryRule = await this.requireRule(id);
        if (payload.categoryId !== undefined) {
            await this.reader.requireById(payload.categoryId);
        }
        const updated: CategoryRule | null = await this.rules.update(id, payload, current);
        if (updated === null) {
            throw new RuleNotFoundError(id);
        }
        const recategorized: number = await this.recategorization.recategorize({ kind: 'rule_saved', ruleId: id });
        this.record(updated, RULE_ACTIONS.updated, recategorized);
        return { rule: toRuleView(updated), recategorized };
    }

    @UsingTransaction()
    public async remove(id: string): Promise<{ recategorized: number }> {
        const current: CategoryRule = await this.requireRule(id);
        await this.rules.remove(id);
        const recategorized: number = await this.recategorization.recategorize({ kind: 'rule_removed', ruleId: id });
        this.record(current, RULE_ACTIONS.removed, recategorized);
        return { recategorized };
    }

    private async requireRule(id: string): Promise<CategoryRule> {
        const rule: CategoryRule | null = await this.rules.findById(id);
        if (rule === null) {
            throw new RuleNotFoundError(id);
        }
        return rule;
    }

    private normalizedPattern(matchType: RuleMatchType, pattern: string): string {
        const normalized: string = normalizeDescription(pattern);
        const minimum: number = matchType === RULE_MATCH_TYPES.contains ? RULE_PATTERN_MIN_LENGTH : 1;
        if (normalized.length < minimum) {
            throw new InvalidRuleError('pattern_too_short');
        }
        if (matchType === RULE_MATCH_TYPES.contains && normalized.length > RULE_PATTERN_MAX_LENGTH) {
            throw new InvalidRuleError('pattern_too_long');
        }
        return normalized;
    }

    private record(rule: CategoryRule, action: RuleAction, recategorized: number): void {
        const matchType: RuleMatchType = toMatchType(rule.matchType);
        this.logs.ruleWritten(rule.id, matchType, action, recategorized);
        this.metrics.ruleAction(action, matchType);
    }
}
