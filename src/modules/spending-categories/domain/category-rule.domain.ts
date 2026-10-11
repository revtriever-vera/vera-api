import { Injectable } from '@nestjs/common';
import { CategoryRulesRepository } from '../repositories/category-rules.repository';
import { CategoryLimitReachedError, RuleConflictError } from './categories.errors';
import { CategoryRule, MAX_RULES_PER_COMPANY, RuleDirection, RuleMatchType } from './categories.types';
import { toMatchType } from './category.mapper';

export interface CreateRuleInput {
    readonly categoryId: string;
    readonly matchType: RuleMatchType;
    readonly pattern: string;
    readonly label: string;
    readonly appliesTo: RuleDirection;
}

export interface UpdateRuleInput {
    readonly categoryId?: string;
    readonly appliesTo?: RuleDirection;
    readonly label?: string;
}

@Injectable()
export class CategoryRuleDomain {
    public constructor(private readonly rules: CategoryRulesRepository) {}

    public async listActive(): Promise<CategoryRule[]> {
        return this.rules.listNewestFirst();
    }

    public async findById(id: string): Promise<CategoryRule | null> {
        return this.rules.findById(id);
    }

    public async findByMatch(matchType: RuleMatchType, pattern: string, appliesTo: RuleDirection): Promise<CategoryRule | null> {
        return this.rules.findByMatch(matchType, pattern, appliesTo);
    }

    public async create(input: CreateRuleInput): Promise<CategoryRule> {
        if ((await this.rules.countActive()) >= MAX_RULES_PER_COMPANY) {
            throw new CategoryLimitReachedError(MAX_RULES_PER_COMPANY);
        }
        const created: CategoryRule | null = await this.rules.createIfAbsent(input);
        if (created !== null) {
            return created;
        }
        const existing: CategoryRule | null = await this.rules.findByMatch(input.matchType, input.pattern, input.appliesTo);
        throw new RuleConflictError(existing?.id ?? '');
    }

    public async update(id: string, input: UpdateRuleInput, current: CategoryRule): Promise<CategoryRule | null> {
        if (input.appliesTo !== undefined) {
            await this.assertNoDuplicate(current, input.appliesTo);
        }
        return this.rules.updateFields(id, input);
    }

    public async remove(id: string): Promise<void> {
        await this.rules.softDelete(id);
    }

    public async removeByCategory(categoryId: string): Promise<CategoryRule[]> {
        return this.rules.softDeleteByCategory(categoryId);
    }

    private async assertNoDuplicate(current: CategoryRule, appliesTo: RuleDirection): Promise<void> {
        const twin: CategoryRule | null = await this.rules.findByMatch(toMatchType(current.matchType), current.pattern, appliesTo);
        if (twin !== null && twin.id !== current.id) {
            throw new RuleConflictError(twin.id);
        }
    }
}
